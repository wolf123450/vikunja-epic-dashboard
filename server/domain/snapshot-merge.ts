import type { BurnupPoint, SnapshotRow } from './types.js';

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
 * snapshot points (source 'snapshot') from then on. `snapshots` are one epic's rows.
 * Days between snapshots (job missed) carry the previous snapshot forward.
 */
export function mergeBurnup(reconstructed: BurnupPoint[], snapshots: SnapshotRow[]): BurnupPoint[] {
  const recon = [...reconstructed].sort((a, b) => a.date.localeCompare(b.date));
  if (snapshots.length === 0) return recon;

  const byDate = new Map(snapshots.map((s) => [s.date, s] as const));
  const snapDates = [...byDate.keys()].sort();
  const first = snapDates[0]!;
  const lastSnap = snapDates[snapDates.length - 1]!;
  const lastRecon = recon.length > 0 ? recon[recon.length - 1]!.date : lastSnap;
  const last = lastRecon > lastSnap ? lastRecon : lastSnap;

  const out: BurnupPoint[] = recon.filter((p) => p.date < first);
  let current = byDate.get(first)!;
  for (let d = first; d <= last; d = nextDay(d)) {
    current = byDate.get(d) ?? current;
    out.push({ ...toPoint(current), date: d });
  }
  return out;
}
