import { describe, expect, it } from 'vitest';
import { mergeBurnup } from './snapshot-merge.js';
import type { BurnupPoint, SnapshotRow } from './types.js';

const rec = (date: string, scope = 10, done = 2): BurnupPoint => ({
  date,
  scopePoints: scope,
  donePoints: done,
  scopeTasks: 5,
  doneTasks: 1,
  source: 'reconstructed',
});

const snap = (date: string, total: number, done: number): SnapshotRow => ({
  date,
  projectId: 1,
  epicSlug: 'a',
  pointsTotal: total,
  pointsDone: done,
  tasksTotal: 7,
  tasksDone: 3,
  unpointedOpen: 0,
});

describe('mergeBurnup', () => {
  it('returns reconstructed unchanged (sorted) when there are no snapshots', () => {
    const r = [rec('2026-10-02'), rec('2026-10-01')];
    expect(mergeBurnup(r, []).map((p) => p.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(mergeBurnup(r, []).every((p) => p.source === 'reconstructed')).toBe(true);
  });

  it('uses snapshots only when nothing is reconstructed', () => {
    const out = mergeBurnup([], [snap('2026-10-02', 12, 4), snap('2026-10-01', 11, 3)]);
    expect(out.map((p) => [p.date, p.scopePoints, p.source])).toEqual([
      ['2026-10-01', 11, 'snapshot'],
      ['2026-10-02', 12, 'snapshot'],
    ]);
    expect(out[0]).toMatchObject({ donePoints: 3, scopeTasks: 7, doneTasks: 3 });
  });

  it('switches from reconstructed to snapshot at the first snapshot date', () => {
    const r = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((d) => rec(d));
    const out = mergeBurnup(r, [snap('2026-10-03', 20, 5), snap('2026-10-04', 21, 6)]);
    expect(out.map((p) => [p.date, p.source, p.scopePoints])).toEqual([
      ['2026-10-01', 'reconstructed', 10],
      ['2026-10-02', 'reconstructed', 10],
      ['2026-10-03', 'snapshot', 20],
      ['2026-10-04', 'snapshot', 21],
    ]);
  });

  it('carries the previous snapshot over missed days', () => {
    const out = mergeBurnup([], [snap('2026-10-01', 10, 1), snap('2026-10-04', 14, 6)]);
    expect(out.map((p) => [p.date, p.scopePoints, p.donePoints])).toEqual([
      ['2026-10-01', 10, 1],
      ['2026-10-02', 10, 1],
      ['2026-10-03', 10, 1],
      ['2026-10-04', 14, 6],
    ]);
    expect(out.every((p) => p.source === 'snapshot')).toBe(true);
  });

  it('extends to a later reconstructed date by carrying the last snapshot', () => {
    const r = [rec('2026-10-01'), rec('2026-10-02'), rec('2026-10-03')];
    const out = mergeBurnup(r, [snap('2026-10-02', 30, 9)]);
    expect(out.map((p) => [p.date, p.source, p.scopePoints])).toEqual([
      ['2026-10-01', 'reconstructed', 10],
      ['2026-10-02', 'snapshot', 30],
      ['2026-10-03', 'snapshot', 30],
    ]);
  });

  it('handles month boundaries when filling gaps', () => {
    const out = mergeBurnup([], [snap('2026-10-30', 1, 0), snap('2026-11-02', 2, 1)]);
    expect(out.map((p) => p.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
});
