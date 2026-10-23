import type { Forecast, Task, WeeklyPoints } from './types.js';

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function calendarDate(at: Date, tz: string): string {
  void at;
  void tz;
  throw new Error('not implemented');
}

/** Monday (YYYY-MM-DD) of the ISO week containing `at` in `tz`. */
export function isoWeekStart(at: Date, tz: string): string {
  void at;
  void tz;
  throw new Error('not implemented');
}

/**
 * Points and tasks completed per ISO week (by doneAt, in tz) for the `weeks` weeks ending
 * with the week containing `now`, oldest first, empty weeks included. Unpointed done tasks
 * count toward `tasks` only.
 */
export function velocity(tasks: Task[], tz: string, now: Date, weeks = 12): WeeklyPoints[] {
  void tasks;
  void tz;
  void now;
  void weeks;
  throw new Error('not implemented');
}

/**
 * Weeks to finish `remainingPoints` at the trailing 4-week velocity, as a range (min and max
 * of the weekly rates). null when fewer than 3 weeks of history (weeks before the first
 * completion don't count) or when remaining is 0 or no points were completed.
 */
export function forecast(remainingPoints: number, history: WeeklyPoints[]): Forecast {
  void remainingPoints;
  void history;
  throw new Error('not implemented');
}
