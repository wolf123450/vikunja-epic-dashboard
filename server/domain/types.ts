// Domain model. Everything in server/domain/ is pure: no I/O, no clock reads (pass `now`).
// Inputs come from server/vikunja (validated API data); outputs feed server/routes.

import type { Board } from '../vikunja/kanban.js';
import type { VikunjaProject, VikunjaTask } from '../vikunja/schemas.js';

export type FlagType =
  /** More than one valid sp: label; the highest value is used. */
  | 'conflicting-points'
  /** An sp: label whose value isn't a positive number; not counted. */
  | 'invalid-points'
  /** POINTS_SCALE is set and the value isn't on it; still counted. */
  | 'off-scale-points'
  /** Points above POINTS_SPLIT_THRESHOLD; still counted. */
  | 'oversized'
  /** Open task with no points. */
  | 'unpointed-open'
  /** Task in no epic. Epic-marker parent tasks themselves are exempt. */
  | 'no-epic'
  /** Task in more than one epic; only raised when EPIC_ALLOW_OVERLAP=false. */
  | 'epic-overlap'
  /** Parent-mode recursion reached a task already on the current path. */
  | 'subtask-cycle'
  /** done flag disagrees with being in the Kanban view's done bucket (only when one is set). */
  | 'done-bucket-mismatch';

export type Flag = { type: FlagType; detail: string };

/** Subset of server/config.ts's Config that the domain needs. */
export type DomainConfig = {
  vikunjaPublicUrl: string;
  includeChildProjects: boolean;
  pointsPrefix: string; // lowercased, e.g. "sp:"
  pointsScale: number[] | null;
  pointsSplitThreshold: number;
  epicMode: 'label' | 'parent' | 'both';
  epicPrefix: string; // lowercased, e.g. "epic:"
  epicMarkerLabel: string; // lowercased, e.g. "epic"
  epicAllowOverlap: boolean;
  epicParentPoints: boolean;
  tz: string; // IANA zone for week boundaries and calendar dates
};

/** One project's raw data as fetched by the sync loop. */
export type ProjectData = {
  project: VikunjaProject;
  tasks: VikunjaTask[];
  board: Board | null;
};

/**
 * A bucket at rollup-root level. Child-project buckets are matched to the root's buckets by
 * name (case-insensitive); `key` is that normalized name, so it is stable across projects.
 */
export type Bucket = {
  key: string; // trimmed, lowercased name
  name: string; // display name from the first project that defined it
  position: number; // 0-based display order: root's buckets first, then unmatched child buckets
  isDone: boolean; // it is (or matched) a Kanban view's done bucket
};

export type Task = {
  id: number;
  ref: string; // Vikunja identifier, e.g. "PRJ-12" or "#12"
  title: string;
  projectId: number;
  rootProjectId: number; // rollup root: top-most ancestor when includeChildProjects, else projectId
  done: boolean;
  doneAt: Date | null; // null when not done, even if Vikunja kept a stale done_at
  createdAt: Date;
  points: number | null; // null = unpointed
  epicKeys: string[]; // Epic.key values
  bucketKey: string | null; // Bucket.key, null = not on the board
  isEpicParent: boolean; // carries the epic marker label (parent mode)
  flags: Flag[];
  url: string; // {VIKUNJA_PUBLIC_URL}/tasks/{id}
};

export type Epic = {
  key: string; // `${rootProjectId}:${slug}`
  slug: string;
  name: string;
  source: 'label' | 'parent'; // 'parent' when a parent task defines it (even if labels also join)
  rootProjectId: number;
  parentTaskId?: number;
};

export type UnmatchedBucket = { rootProjectId: number; projectId: number; bucketName: string };

/** Output of buildModel: everything the routes need, per sync. */
export type Model = {
  tasks: Task[];
  epics: Epic[];
  /** Buckets per rollup root, in display order. */
  buckets: Map<number, Bucket[]>;
  /** Child-project buckets that had no name match in their root (appended to its buckets). */
  unmatchedBuckets: UnmatchedBucket[];
  /** Project id -> rollup root id. */
  rootOf: Map<number, number>;
};

export type EpicStatus = 'in-progress' | 'not-started' | 'done';

export type BucketCount = {
  bucketKey: string | null; // null = not on the board
  tasks: number;
  points: number;
  unpointed: number;
};

export type Rollup = {
  pointsTotal: number;
  pointsDone: number;
  tasksTotal: number;
  tasksDone: number;
  unpointedOpen: number;
  status: EpicStatus; // empty epic = 'not-started'
  lastCompletedAt: Date | null;
  buckets: BucketCount[]; // non-empty buckets only, unordered
};

export type WeeklyPoints = {
  weekStart: string; // YYYY-MM-DD, Monday of the ISO week in cfg.tz
  points: number;
  tasks: number;
};

export type BurnupPoint = {
  date: string; // YYYY-MM-DD in cfg.tz
  scopePoints: number;
  donePoints: number;
  scopeTasks: number;
  doneTasks: number;
  source: 'reconstructed' | 'snapshot';
};

export type Forecast = { weeksLow: number; weeksHigh: number } | null;

/** One row of the snapshots table (see SPEC.md). */
export type SnapshotRow = {
  date: string; // YYYY-MM-DD
  projectId: number; // rollup root id
  epicSlug: string; // '' = the "No epic" bucket
  pointsTotal: number;
  pointsDone: number;
  tasksTotal: number;
  tasksDone: number;
  unpointedOpen: number;
};

export const NO_EPIC_SLUG = '';
