import type { BucketCountDTO, BucketDTO, RollupDTO } from '../../../shared/api';
import { UNBUCKETED_COLOR } from '../../../shared/palette';

export type SegmentMode = 'tasks' | 'points';

export type Segment = {
  bucketKey: string | null;
  name: string;
  color: string;
  tasks: number;
  points: number;
  unpointed: number;
  /** Share of the epic's tickets in this bucket, 0-100. */
  pctOfEpic: number;
  /** Segment width weight (tickets or points); usable as a flex-grow value. */
  weight: number;
  /** Width as % of the bar, 0-100. */
  widthPct: number;
  /** Centre of the segment as % of the bar, for tooltip placement. */
  centerPct: number;
};

export type SegmentBar = {
  segments: Segment[];
  /** No segment has any width: no tickets, or (points mode) no pointed tickets. */
  empty: boolean;
  /** Label for an empty bar. */
  emptyLabel: string | null;
};

export const NO_BUCKET_NAME = 'Not on board';

/**
 * One segment per non-empty bucket in BucketDTO.position order; unbucketed last.
 * Points mode: unpointed tickets add no width (they still show in the tooltip).
 */
export function computeSegments(
  rollup: Pick<RollupDTO, 'buckets'>,
  buckets: readonly BucketDTO[],
  mode: SegmentMode,
): SegmentBar {
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const counts = rollup.buckets.filter((c) => c.tasks > 0);
  const totalTasks = counts.reduce((s, c) => s + c.tasks, 0);

  const order = (c: BucketCountDTO): number => {
    if (c.bucketKey === null) return Number.MAX_SAFE_INTEGER;
    return byKey.get(c.bucketKey)?.position ?? Number.MAX_SAFE_INTEGER - 1;
  };
  const sorted = [...counts].sort((a, b) => order(a) - order(b));

  const raw = sorted.map((c) => {
    const bucket = c.bucketKey === null ? undefined : byKey.get(c.bucketKey);
    return {
      bucketKey: c.bucketKey,
      name: c.bucketKey === null ? NO_BUCKET_NAME : (bucket?.name ?? c.bucketKey),
      color: bucket?.color ?? UNBUCKETED_COLOR,
      tasks: c.tasks,
      points: c.points,
      unpointed: c.unpointed,
      pctOfEpic: totalTasks > 0 ? (c.tasks / totalTasks) * 100 : 0,
      weight: mode === 'tasks' ? c.tasks : c.points,
    };
  });

  const totalWeight = raw.reduce((s, r) => s + r.weight, 0);
  if (totalWeight <= 0) {
    return {
      segments: [],
      empty: true,
      emptyLabel: totalTasks === 0 ? 'no tasks' : mode === 'points' ? 'unpointed' : null,
    };
  }

  let cursor = 0;
  const segments: Segment[] = [];
  for (const r of raw) {
    if (r.weight <= 0) continue; // points mode: a bucket of only unpointed tickets has no width
    const widthPct = (r.weight / totalWeight) * 100;
    segments.push({ ...r, widthPct, centerPct: cursor + widthPct / 2 });
    cursor += widthPct;
  }
  return { segments, empty: false, emptyLabel: null };
}

export function segmentDescription(s: Segment): string {
  const pct = Math.round(s.pctOfEpic);
  return `${s.name}: ${s.tasks} ${s.tasks === 1 ? 'ticket' : 'tickets'} (${pct}% of epic), ${s.points} pts, ${s.unpointed} unpointed`;
}
