import { describe, expect, it } from 'vitest';
import { BUCKET_PALETTE, DONE_COLOR } from '../../shared/palette.js';
import { rollup } from '../domain/rollup.js';
import { task } from '../domain/testing.js';
import type { Bucket, Epic, Model } from '../domain/types.js';
import { epicDTO, mergedBuckets } from './dto.js';

const b = (key: string, position: number, isDone = false): Bucket => ({ key, name: key, position, isDone });
const model = (buckets: [number, Bucket[]][]): Model =>
  ({ tasks: [], epics: [], buckets: new Map(buckets), unmatchedBuckets: [], rootOf: new Map() }) as Model;

describe('mergedBuckets colours', () => {
  it('colours by merged display index, so buckets from different roots never share a colour', () => {
    // Both roots have a bucket at their own position 1; merged they sit at 1 and 2.
    const m = model([
      [1, [b('backlog', 0), b('doing', 1)]],
      [2, [b('backlog', 0), b('review', 1)]],
    ]);
    const out = mergedBuckets(m, [1, 2], new Map());
    expect(out.map((x) => [x.key, x.position])).toEqual([['backlog', 0], ['doing', 1], ['review', 2]]);
    expect(out.map((x) => x.color)).toEqual([BUCKET_PALETTE[0], BUCKET_PALETTE[1], BUCKET_PALETTE[2]]);
    expect(new Set(out.map((x) => x.color)).size).toBe(3);
  });

  it('keeps the done colour for done buckets and lets overrides win', () => {
    const m = model([
      [1, [b('todo', 0), b('done', 1, true)]],
      [2, [b('qa', 0), b('shipped', 1, true)]],
    ]);
    const out = mergedBuckets(m, [1, 2], new Map([['qa', '#123456']]));
    expect(Object.fromEntries(out.map((x) => [x.key, x.color]))).toEqual({
      todo: BUCKET_PALETTE[0],
      done: DONE_COLOR,
      qa: '#123456',
      shipped: DONE_COLOR,
    });
  });
});

describe('epicDTO dates', () => {
  const at = (s: string): Date => new Date(s);
  const title = (): string => 'P';

  it('uses the parent task for created and includes its edits in last activity', () => {
    const parent = task(10, { createdAt: at('2025-12-01T00:00:00Z'), updatedAt: at('2026-06-01T00:00:00Z') });
    const member = task(11, { createdAt: at('2026-01-01T00:00:00Z'), updatedAt: at('2026-03-01T00:00:00Z') });
    const m = { ...model([]), tasks: [parent, member] } as Model;
    const epic: Epic = { key: '1:x', slug: 'x', name: 'X', source: 'parent', rootProjectId: 1, parentTaskId: 10 };
    const dto = epicDTO(m, epic, rollup([member]), title);
    expect(dto.createdAt).toBe('2025-12-01T00:00:00.000Z');
    expect(dto.lastActivityAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('falls back to member dates for label epics', () => {
    const member = task(11, { createdAt: at('2026-01-01T00:00:00Z'), updatedAt: at('2026-03-01T00:00:00Z') });
    const epic: Epic = { key: '1:x', slug: 'x', name: 'X', source: 'label', rootProjectId: 1 };
    const dto = epicDTO(model([]), epic, rollup([member]), title);
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.lastActivityAt).toBe('2026-03-01T00:00:00.000Z');
  });
});
