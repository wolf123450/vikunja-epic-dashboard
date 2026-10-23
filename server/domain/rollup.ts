import type { EpicStatus, Model, Rollup, Task } from './types.js';

/** Points/task totals, status, last completion, and per-bucket counts for a set of tasks. */
export function rollup(tasks: Task[]): Rollup {
  void tasks;
  throw new Error('not implemented');
}

/** Member tasks of an epic (by Epic.key). An epic-marker parent task is not its own member. */
export function epicTasks(model: Model, epicKey: string): Task[] {
  void model;
  void epicKey;
  throw new Error('not implemented');
}

/** Tasks in no epic under the given roots, excluding epic-marker parent tasks. */
export function noEpicTasks(model: Model, rootProjectId: number): Task[] {
  void model;
  void rootProjectId;
  throw new Error('not implemented');
}

/** Sort order for epic lists: in progress, not started, done; then points remaining desc. */
export function compareRollups(a: { status: EpicStatus; pointsTotal: number; pointsDone: number }, b: typeof a): number {
  void a;
  void b;
  throw new Error('not implemented');
}
