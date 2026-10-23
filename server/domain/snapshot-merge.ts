import type { BurnupPoint, Rollup, SnapshotRow } from './types.js';

const DAY_MS = 86_400_000;

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

function toPoint(row: SnapshotRow): BurnupPoint {
  return {
    date: row.date,
    scopePoints: row.pointsTotal,
    donePoints: row.pointsDone,
    scopeTasks: row.tasksTotal,
    doneTasks: row.tasksDone,
    source: 'snapshot',
  };
}

/**
 * Burn-up combining both sources: reconstructed points before the first snapshot date,
 * snapshot points (source 'snapshot') from the first to the last snapshot date, then
 * reconstructed points again for days after the last snapshot (so a stalled snapshot job shows
 * as 'reconstructed' rather than a flat "exact" line). `snapshots` are one epic's rows.
 * Days between two snapshot dates (job missed) carry the previous snapshot forward.
 */
export function mergeBurnup(reconstructed: BurnupPoint[], snapshots: SnapshotRow[]): BurnupPoint[] {
  const recon = [...reconstructed].sort((a, b) => a.date.localeCompare(b.date));
  if (snapshots.length === 0) return recon;

  const byDate = new Map(snapshots.map((s) => [s.date, s] as const));
  const snapDates = [...byDate.keys()].sort();
  const first = snapDates[0]!;
  const lastSnap = snapDates[snapDates.length - 1]!;

  const out: BurnupPoint[] = recon.filter((p) => p.date < first);
  let current = byDate.get(first)!;
  for (let d = first; d <= lastSnap; d = nextDay(d)) {
    current = byDate.get(d) ?? current;
    out.push({ ...toPoint(current), date: d });
  }
  out.push(...recon.filter((p) => p.date > lastSnap));
  return out;
}

/**
 * Replace the point for `today` with the live rollup of the epic's current members. With any
 * snapshots the point is marked 'snapshot' (it is the exact current state); without, it keeps
 * 'reconstructed'. Appended when the series has no point for today yet; an empty series stays empty.
 */
export function withLiveToday(
  burnup: BurnupPoint[],
  live: Pick<Rollup, 'pointsTotal' | 'pointsDone' | 'tasksTotal' | 'tasksDone'>,
  today: string,
  hasSnapshots: boolean,
): BurnupPoint[] {
  if (burnup.length === 0) return burnup;
  const point: BurnupPoint = {
    date: today,
    scopePoints: live.pointsTotal,
    donePoints: live.pointsDone,
    scopeTasks: live.tasksTotal,
    doneTasks: live.tasksDone,
    source: hasSnapshots ? 'snapshot' : 'reconstructed',
  };
  return [...burnup.filter((p) => p.date !== today), point].sort((a, b) => a.date.localeCompare(b.date));
}
