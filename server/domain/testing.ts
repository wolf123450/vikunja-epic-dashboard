// Small factories for domain tests. Not imported by production code.
import type { Board } from '../vikunja/kanban.js';
import type { VikunjaProject, VikunjaTask } from '../vikunja/schemas.js';
import type { DomainConfig, Task } from './types.js';

export const cfg: DomainConfig = {
  vikunjaPublicUrl: 'https://vk.example.test',
  includeChildProjects: true,
  pointsPrefix: 'sp:',
  pointsScale: null,
  pointsSplitThreshold: 5,
  epicMode: 'both',
  epicPrefix: 'epic:',
  epicMarkerLabel: 'epic',
  epicAllowOverlap: true,
  epicParentPoints: false,
  tz: 'America/Los_Angeles',
};

export function project(id: number, parent = 0, title = `Project ${id}`): VikunjaProject {
  return { id, title, identifier: `P${id}`, parent_project_id: parent, is_archived: false, position: id, views: [] };
}

export type TaskOpts = {
  project?: number;
  labels?: string[];
  done?: boolean;
  doneAt?: string | null;
  created?: string;
  subtasks?: number[];
  title?: string;
};

export function vtask(id: number, o: TaskOpts = {}): VikunjaTask {
  const done = o.done ?? false;
  return {
    id,
    identifier: `P${o.project ?? 1}-${id}`,
    index: id,
    title: o.title ?? `Task ${id}`,
    project_id: o.project ?? 1,
    done,
    done_at: done ? new Date(o.doneAt ?? '2026-01-10T12:00:00Z') : null,
    created: new Date(o.created ?? '2026-01-01T12:00:00Z'),
    updated: new Date('2026-01-01T12:00:00Z'),
    labels: (o.labels ?? []).map((title, i) => ({ id: id * 100 + i, title })),
    related_tasks: o.subtasks ? { subtask: o.subtasks.map((s) => ({ id: s, project_id: o.project ?? 1 })) } : {},
  };
}

export function board(
  projectId: number,
  buckets: Array<[id: number, name: string]>,
  taskBucket: Array<[task: number, bucket: number]> = [],
  doneBucketId = 0,
): Board {
  return {
    projectId,
    viewId: projectId * 10,
    buckets: buckets.map(([id, name], position) => ({ id, name, position })),
    doneBucketId,
    taskBucket: new Map(taskBucket),
  };
}

export function task(id: number, o: Partial<Task> = {}): Task {
  return {
    id,
    ref: `#${id}`,
    title: `Task ${id}`,
    projectId: 1,
    rootProjectId: 1,
    done: false,
    doneAt: null,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    points: null,
    epicKeys: [],
    bucketKey: null,
    isEpicParent: false,
    flags: [],
    url: `https://vk.example.test/tasks/${id}`,
    ...o,
  };
}
