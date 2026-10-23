import type { BurnupPointDTO } from '../../../shared/api';

export type BurnupMetric = 'points' | 'tasks';

export type BurnupSeries = {
  dates: string[];
  scope: number[];
  done: number[];
  /** First and last reconstructed date, or null when the whole history is snapshots. */
  reconstructed: [string, string] | null;
};

export function buildBurnupSeries(points: readonly BurnupPointDTO[], metric: BurnupMetric): BurnupSeries {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const recon = sorted.filter((p) => p.source === 'reconstructed');
  const first = recon[0];
  const last = recon[recon.length - 1];
  return {
    dates: sorted.map((p) => p.date),
    scope: sorted.map((p) => (metric === 'points' ? p.scopePoints : p.scopeTasks)),
    done: sorted.map((p) => (metric === 'points' ? p.donePoints : p.doneTasks)),
    reconstructed: first && last ? [first.date, last.date] : null,
  };
}
