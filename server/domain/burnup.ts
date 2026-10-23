import type { BurnupPoint, Task } from './types.js';

/**
 * Approximate daily burn-up (source 'reconstructed') from the earliest createdAt to `now`:
 * scope places each task's current points at its created date; done uses doneAt.
 * Calendar dates in tz.
 */
export function reconstructBurnup(tasks: Task[], tz: string, now: Date): BurnupPoint[] {
  void tasks;
  void tz;
  void now;
  throw new Error('not implemented');
}
