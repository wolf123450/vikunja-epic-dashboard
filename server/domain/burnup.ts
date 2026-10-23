import type { BurnupPoint, Task } from './types.js';
import { addDays, calendarDate } from './velocity.js';

type Tally = { tasks: number; points: number };

/**
 * Approximate daily burn-up (source 'reconstructed') from the earliest createdAt to `now`:
 * scope places each task's current points at its created date; done uses doneAt.
 * Calendar dates in tz. One point per day, inclusive; unpointed tasks count in task series only.
 */
export function reconstructBurnup(tasks: Task[], tz: string, now: Date): BurnupPoint[] {
  if (tasks.length === 0) return [];

  const created = new Map<string, Tally>();
  const done = new Map<string, Tally>();
  const bump = (m: Map<string, Tally>, day: string, points: number | null) => {
    const e = m.get(day) ?? { tasks: 0, points: 0 };
    e.tasks++;
    e.points += points ?? 0;
    m.set(day, e);
  };

  let start = '';
  for (const t of tasks) {
    const day = calendarDate(t.createdAt, tz);
    if (start === '' || day < start) start = day;
    bump(created, day, t.points);
    if (t.done && t.doneAt) bump(done, calendarDate(t.doneAt, tz), t.points);
  }

  const end = calendarDate(now, tz);
  const out: BurnupPoint[] = [];
  let scopePoints = 0;
  let scopeTasks = 0;
  let donePoints = 0;
  let doneTasks = 0;

  // A done_at earlier than every created date lands on day one.
  for (const [day, e] of done) {
    if (day < start) {
      donePoints += e.points;
      doneTasks += e.tasks;
    }
  }

  for (let day = start; day <= end; day = addDays(day, 1)) {
    const c = created.get(day);
    if (c) {
      scopeTasks += c.tasks;
      scopePoints += c.points;
    }
    const d = done.get(day);
    if (d) {
      doneTasks += d.tasks;
      donePoints += d.points;
    }
    out.push({ date: day, scopePoints, donePoints, scopeTasks, doneTasks, source: 'reconstructed' });
  }
  return out;
}
