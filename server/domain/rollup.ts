import type { BucketCount, EpicStatus, Model, Rollup, Task } from './types.js';

/** Points/task totals, status, last completion, and per-bucket counts for a set of tasks. */
export function rollup(tasks: Task[]): Rollup {
  let pointsTotal = 0;
  let pointsDone = 0;
  let tasksDone = 0;
  let unpointedOpen = 0;
  let lastCompletedAt: Date | null = null;
  const buckets = new Map<string | null, BucketCount>();

  for (const t of tasks) {
    let b = buckets.get(t.bucketKey);
    if (!b) {
      b = { bucketKey: t.bucketKey, tasks: 0, points: 0, unpointed: 0 };
      buckets.set(t.bucketKey, b);
    }
    b.tasks++;
    if (t.points === null) {
      b.unpointed++;
      if (!t.done) unpointedOpen++;
    } else {
      pointsTotal += t.points;
      b.points += t.points;
      if (t.done) pointsDone += t.points;
    }
    if (t.done) {
      tasksDone++;
      if (t.doneAt && (!lastCompletedAt || t.doneAt > lastCompletedAt)) lastCompletedAt = t.doneAt;
    }
  }

  const status: EpicStatus =
    tasks.length > 0 && tasksDone === tasks.length ? 'done' : tasksDone === 0 ? 'not-started' : 'in-progress';

  return {
    pointsTotal,
    pointsDone,
    tasksTotal: tasks.length,
    tasksDone,
    unpointedOpen,
    status,
    lastCompletedAt,
    buckets: [...buckets.values()],
  };
}

/**
 * Member tasks of an epic (by Epic.key). An epic-marker parent task is not its own member
 * (buildModel only puts it in its own epic when EPIC_PARENT_POINTS is on, via Task.epicKeys).
 */
export function epicTasks(model: Model, epicKey: string): Task[] {
  return model.tasks.filter((t) => t.epicKeys.includes(epicKey));
}

/** Tasks in no epic under the given roots, excluding epic-marker parent tasks. */
export function noEpicTasks(model: Model, rootProjectId: number): Task[] {
  return model.tasks.filter((t) => t.rootProjectId === rootProjectId && t.epicKeys.length === 0 && !t.isEpicParent);
}

const STATUS_ORDER: Record<EpicStatus, number> = { 'in-progress': 0, 'not-started': 1, done: 2 };

/** Sort order for epic lists: in progress, not started, done; then points remaining desc. */
export function compareRollups(a: { status: EpicStatus; pointsTotal: number; pointsDone: number }, b: typeof a): number {
  const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (s !== 0) return s;
  return b.pointsTotal - b.pointsDone - (a.pointsTotal - a.pointsDone);
}
