import type { Forecast, Task, WeeklyPoints } from './types.js';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(tz, f);
  }
  return f;
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function calendarDate(at: Date, tz: string): string {
  const parts = formatter(tz).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
}

function parseDay(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Add whole calendar days to a YYYY-MM-DD string (no time zone involved, so DST-proof). */
export function addDays(day: string, n: number): string {
  return new Date(parseDay(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the ISO week containing `at` in `tz`. */
export function isoWeekStart(at: Date, tz: string): string {
  const day = calendarDate(at, tz);
  const dow = new Date(parseDay(day)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/**
 * Points and tasks completed per ISO week (by doneAt, in tz) for the `weeks` weeks ending
 * with the week containing `now`, oldest first, empty weeks included. Unpointed done tasks
 * count toward `tasks` only.
 */
export function velocity(tasks: Task[], tz: string, now: Date, weeks = 12): WeeklyPoints[] {
  const current = isoWeekStart(now, tz);
  const result: WeeklyPoints[] = [];
  for (let i = weeks - 1; i >= 0; i--) result.push({ weekStart: addDays(current, -7 * i), points: 0, tasks: 0 });
  const byWeek = new Map(result.map((w) => [w.weekStart, w]));
  for (const t of tasks) {
    if (!t.done || !t.doneAt) continue;
    const w = byWeek.get(isoWeekStart(t.doneAt, tz));
    if (!w) continue;
    w.tasks++;
    w.points += t.points ?? 0;
  }
  return result;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Weeks to finish `remainingPoints` at the trailing 4-week velocity, as a range. Weeks before
 * the first completion are ignored. weeksLow = remaining / best weekly rate in the window;
 * weeksHigh = remaining / worst rate (or / mean rate when some week had zero points).
 * null when fewer than 3 usable weeks, remaining <= 0, or no points completed in the window.
 */
export function forecast(remainingPoints: number, history: WeeklyPoints[]): Forecast {
  if (remainingPoints <= 0) return null;
  const first = history.findIndex((w) => w.tasks > 0 || w.points > 0);
  if (first < 0) return null;
  const window = history.slice(first).slice(-4);
  if (window.length < 3) return null;
  const rates = window.map((w) => w.points);
  const max = Math.max(...rates);
  if (max <= 0) return null;
  const min = Math.min(...rates);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return {
    weeksLow: round1(remainingPoints / max),
    weeksHigh: round1(remainingPoints / (min === 0 ? mean : min)),
  };
}
