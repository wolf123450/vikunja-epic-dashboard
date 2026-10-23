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
