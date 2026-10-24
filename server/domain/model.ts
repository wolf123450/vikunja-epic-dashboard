import type { Board } from '../vikunja/kanban.js';
import type { VikunjaProject, VikunjaTask } from '../vikunja/schemas.js';
import { epicDisplayName, epicLabelSlugs, slugify } from './epics.js';
import { parsePoints } from './points.js';
import type {
  Bucket,
  DomainConfig,
  Epic,
  Flag,
  Model,
  ProjectData,
  Task,
  UnmatchedBucket,
} from './types.js';

const bucketKey = (name: string) => name.trim().toLowerCase();

function addFlag(task: Task, flag: Flag): void {
  if (!task.flags.some((f) => f.type === flag.type && f.detail === flag.detail)) task.flags.push(flag);
}

/**
 * Project id -> rollup root id. The root is the top-most ancestor that is itself in `data` (the
 * selected/fetched projects), so a selected child whose parent isn't selected is its own root.
 */
function computeRoots(data: ProjectData[], cfg: DomainConfig): Map<number, number> {
  const byId = new Map<number, VikunjaProject>();
  for (const d of data) byId.set(d.project.id, d.project);

  const rootOf = new Map<number, number>();
  for (const p of byId.values()) {
    let current = p;
    if (cfg.includeChildProjects) {
      const seen = new Set<number>([current.id]);
      while (current.parent_project_id > 0) {
        const parent = byId.get(current.parent_project_id);
        if (!parent || seen.has(parent.id)) break;
        seen.add(parent.id);
        current = parent;
      }
    }
    rootOf.set(p.id, current.id);
  }
  return rootOf;
}

type RootBuckets = { buckets: Bucket[]; unmatched: UnmatchedBucket[] };

function computeBuckets(data: ProjectData[], rootOf: Map<number, number>): Map<number, RootBuckets> {
  const result = new Map<number, RootBuckets>();
  const roots = [...new Set(data.map((d) => rootOf.get(d.project.id) ?? d.project.id))];

  for (const root of roots) {
    const members = data.filter((d) => (rootOf.get(d.project.id) ?? d.project.id) === root);
    const ordered = [...members.filter((d) => d.project.id === root), ...members.filter((d) => d.project.id !== root)];
    const buckets: Bucket[] = [];
    const unmatched: UnmatchedBucket[] = [];
    const index = new Map<string, Bucket>();
    const rootHasBoard = ordered.some((d) => d.project.id === root && d.board !== null);

    for (const d of ordered) {
      const board = d.board;
      if (!board) continue;
      for (const b of board.buckets) {
        const key = bucketKey(b.name);
        const isDone = board.doneBucketId !== 0 && b.id === board.doneBucketId;
        const existing = index.get(key);
        if (existing) {
          if (isDone) existing.isDone = true;
          continue;
        }
        const created: Bucket = { key, name: b.name, position: buckets.length, isDone };
        index.set(key, created);
        buckets.push(created);
        if (rootHasBoard && d.project.id !== root) {
          unmatched.push({ rootProjectId: root, projectId: d.project.id, bucketName: b.name });
        }
      }
    }
    result.set(root, { buckets, unmatched });
  }
  return result;
}

/**
 * Normalize fetched data into the domain model:
 * - rollup roots from project ancestry when cfg.includeChildProjects, climbing only through the
 *   projects in `data` (selected/fetched), never through unselected ancestors. `allProjects` is
 *   accepted for call-site compatibility and not used for roots.
 * - points and flags per task (parsePoints)
 * - epics per cfg.epicMode: label epics, parent epics (marker label + recursive subtasks,
 *   cycle-safe), and 'both' merging by slug (see SPEC.md "Merging in both mode"); epics are
 *   keyed by root + slug, so the same slug in a parent and its child merges, but not across roots
 * - buckets per root: root's board first, child boards matched by name and unmatched appended
 * - no-epic, unpointed-open, epic-overlap, done-bucket-mismatch flags
 * - doneAt null for open tasks; url = cfg.vikunjaPublicUrl + '/tasks/' + id
 *
 * Epic-marker tasks are never members of an epic, except of their own when
 * cfg.epicParentPoints is true. They get no 'no-epic' flag, and no 'unpointed-open' flag unless
 * epicParentPoints is true (their points aren't counted otherwise).
 */
export function buildModel(data: ProjectData[], _allProjects: VikunjaProject[], cfg: DomainConfig): Model {
  const rootOf = computeRoots(data, cfg);
  const rootFor = (projectId: number) => rootOf.get(projectId) ?? projectId;

  const useLabels = cfg.epicMode === 'label' || cfg.epicMode === 'both';
  const useParents = cfg.epicMode === 'parent' || cfg.epicMode === 'both';
  const baseUrl = cfg.vikunjaPublicUrl.replace(/\/+$/, '');

  const boards = new Map<number, Board>();
  for (const d of data) if (d.board) boards.set(d.project.id, d.board);

  const raw = new Map<number, VikunjaTask>();
  const tasks: Task[] = [];
  const byId = new Map<number, Task>();
  const labelTitles = new Map<number, string[]>();

  for (const d of data) {
    for (const vt of d.tasks) {
      const titles = vt.labels.map((l) => l.title);
      const { points, flags } = parsePoints(titles, cfg);
      const isMarker = useParents && titles.some((t) => t.trim().toLowerCase() === cfg.epicMarkerLabel);

      const board = boards.get(vt.project_id);
      const bucketId = board?.taskBucket.get(vt.id);
      const bucketName = bucketId === undefined ? undefined : board?.buckets.find((b) => b.id === bucketId)?.name;

      const task: Task = {
        id: vt.id,
        ref: vt.identifier || `#${vt.index}`,
        title: vt.title,
        projectId: vt.project_id,
        rootProjectId: rootFor(vt.project_id),
        done: vt.done,
        doneAt: vt.done ? vt.done_at : null,
        createdAt: vt.created,
        updatedAt: vt.updated,
        points,
        epicKeys: [],
        bucketKey: bucketName === undefined ? null : bucketKey(bucketName),
        isEpicParent: isMarker,
        flags,
        url: `${baseUrl}/tasks/${vt.id}`,
      };

      if (board && board.doneBucketId !== 0 && bucketId !== undefined) {
        const inDone = bucketId === board.doneBucketId;
        if (task.done !== inDone) {
          addFlag(task, {
            type: 'done-bucket-mismatch',
            detail: task.done ? `done but in bucket "${bucketName}"` : `open but in done bucket "${bucketName}"`,
          });
        }
      }

      raw.set(vt.id, vt);
      labelTitles.set(vt.id, titles);
      byId.set(vt.id, task);
      tasks.push(task);
    }
  }

  const epics = new Map<string, Epic>();
  const join = (task: Task, key: string) => {
    if (!task.epicKeys.includes(key)) task.epicKeys.push(key);
  };

  // Parent-mode epics: marker task + recursive subtasks.
  if (useParents) {
    for (const marker of tasks.filter((t) => t.isEpicParent)) {
      const root = marker.rootProjectId;
      const slug = epicLabelSlugs(labelTitles.get(marker.id)!, cfg)[0] || slugify(marker.title) || `task-${marker.id}`;
      const key = `${root}:${slug}`;
      const existing = epics.get(key);
      if (!existing || existing.source === 'label') {
        epics.set(key, { key, slug, name: epicDisplayName(slug), source: 'parent', rootProjectId: root, parentTaskId: marker.id });
      }
      if (cfg.epicParentPoints) join(marker, key);

      const finished = new Set<number>();
      const walk = (task: Task, path: Set<number>) => {
        path.add(task.id);
        for (const rel of raw.get(task.id)!.related_tasks['subtask'] ?? []) {
          const child = byId.get(rel.id);
          if (!child) continue;
          if (path.has(child.id)) {
            addFlag(task, { type: 'subtask-cycle', detail: `subtask "${child.title}" is already an ancestor` });
            continue;
          }
          if (finished.has(child.id)) continue;
          if (!child.isEpicParent) join(child, key);
          walk(child, path);
        }
        path.delete(task.id);
        finished.add(task.id);
      };
      walk(marker, new Set());
    }
  }

  // Label-mode epics.
  if (useLabels) {
    for (const task of tasks) {
      if (task.isEpicParent) continue;
      for (const slug of epicLabelSlugs(labelTitles.get(task.id)!, cfg)) {
        const key = `${task.rootProjectId}:${slug}`;
        if (!epics.has(key)) {
          epics.set(key, { key, slug, name: epicDisplayName(slug), source: 'label', rootProjectId: task.rootProjectId });
        }
        join(task, key);
      }
    }
  }

  // Remaining flags.
  for (const task of tasks) {
    if (!task.isEpicParent && task.epicKeys.length === 0) {
      addFlag(task, { type: 'no-epic', detail: 'not in any epic' });
    }
    if (task.points === null && !task.done && (!task.isEpicParent || cfg.epicParentPoints)) {
      addFlag(task, { type: 'unpointed-open', detail: 'open task without points' });
    }
    if (!cfg.epicAllowOverlap && task.epicKeys.length > 1) {
      addFlag(task, { type: 'epic-overlap', detail: `in ${task.epicKeys.length} epics: ${task.epicKeys.map((k) => k.split(':').slice(1).join(':')).join(', ')}` });
    }
  }

  const bucketsByRoot = computeBuckets(data, rootOf);
  const buckets = new Map<number, Bucket[]>();
  const unmatchedBuckets: UnmatchedBucket[] = [];
  for (const [root, rb] of bucketsByRoot) {
    buckets.set(root, rb.buckets);
    unmatchedBuckets.push(...rb.unmatched);
  }

  return { tasks, epics: [...epics.values()], buckets, unmatchedBuckets, rootOf };
}
