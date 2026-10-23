// Bucket colours: fixed palette by bucket position, success colour for done buckets, grey for
// tickets not on the board. Overrides (BUCKET_COLORS) are keyed by normalized bucket name.
// Chosen to stay distinguishable on the dark default theme and the light theme.

export const BUCKET_PALETTE = ['#6b7280', '#3b82f6', '#a855f7', '#f59e0b', '#06b6d4', '#ec4899', '#84cc16', '#f97316'];
export const DONE_COLOR = '#22c55e';
export const UNBUCKETED_COLOR = '#4b5563';

export function bucketColor(
  bucket: { key: string; position: number; isDone: boolean },
  overrides: ReadonlyMap<string, string> = new Map(),
): string {
  const override = overrides.get(bucket.key);
  if (override) return override;
  if (bucket.isDone) return DONE_COLOR;
  return BUCKET_PALETTE[bucket.position % BUCKET_PALETTE.length]!;
}
