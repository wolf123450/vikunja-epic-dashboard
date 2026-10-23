import type { BurnupPoint, SnapshotRow } from './types.js';

/**
 * Burn-up combining both sources: reconstructed points before the first snapshot date,
 * snapshot points (source 'snapshot') from then on. `snapshots` are one epic's rows.
 * Days between snapshots (job missed) carry the previous snapshot forward.
 */
export function mergeBurnup(reconstructed: BurnupPoint[], snapshots: SnapshotRow[]): BurnupPoint[] {
  void reconstructed;
  void snapshots;
  throw new Error('not implemented');
}
