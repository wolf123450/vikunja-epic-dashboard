import type { TaskDTO } from '../../../shared/api';

export const NO_BUCKET_FILTER = '__none__';

export type TaskFilters = {
  /** Bucket key, NO_BUCKET_FILTER for tasks not on the board, '' for any. */
  bucket: string;
  state: 'all' | 'open' | 'done';
  pointed: 'all' | 'pointed' | 'unpointed';
};

export const DEFAULT_FILTERS: TaskFilters = { bucket: '', state: 'all', pointed: 'all' };

export function filterTasks(tasks: readonly TaskDTO[], f: TaskFilters): TaskDTO[] {
  return tasks.filter((t) => {
    if (f.bucket === NO_BUCKET_FILTER) {
      if (t.bucketKey !== null) return false;
    } else if (f.bucket !== '' && t.bucketKey !== f.bucket) {
      return false;
    }
    if (f.state === 'open' && t.done) return false;
    if (f.state === 'done' && !t.done) return false;
    if (f.pointed === 'pointed' && t.points === null) return false;
    if (f.pointed === 'unpointed' && t.points !== null) return false;
    return true;
  });
}

export type TaskSortKey = 'ref' | 'title' | 'bucket' | 'points' | 'state' | 'doneAt' | 'flags';
export type TaskSortDir = 'asc' | 'desc';

/** Natural first direction per column: numbers and dates largest/newest first, text A-Z. */
export const TASK_SORT_FIRST_DIR: Record<TaskSortKey, TaskSortDir> = {
  ref: 'asc',
  title: 'asc',
  bucket: 'asc',
  points: 'desc',
  state: 'asc',
  doneAt: 'desc',
  flags: 'desc',
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function taskValue(t: TaskDTO, key: TaskSortKey, bucketPos: ReadonlyMap<string, number>): string | number | null {
  switch (key) {
    case 'ref':
      return t.ref;
    case 'title':
      return t.title;
    case 'bucket':
      return t.bucketKey === null ? null : (bucketPos.get(t.bucketKey) ?? null);
    case 'points':
      return t.points;
    case 'state':
      return t.done ? 1 : 0; // open first when ascending
    case 'doneAt':
      return t.doneAt ? new Date(t.doneAt).getTime() : null;
    case 'flags':
      return t.flags.length;
  }
}

/**
 * Sorted copy. Text compares naturally (SHIP-9 before SHIP-10), buckets by board position.
 * Missing values (no points, not done, not on the board) sort last in either direction; ties keep
 * the input order.
 */
export function sortTasks(
  tasks: readonly TaskDTO[],
  key: TaskSortKey,
  dir: TaskSortDir,
  bucketPos: ReadonlyMap<string, number> = new Map(),
): TaskDTO[] {
  const sign = dir === 'asc' ? 1 : -1;
  return tasks
    .map((t, i) => ({ t, i, v: taskValue(t, key, bucketPos) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      const c = typeof a.v === 'string' ? collator.compare(a.v, b.v as string) : a.v - (b.v as number);
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.t);
}
