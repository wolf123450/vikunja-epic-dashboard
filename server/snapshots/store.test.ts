import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SnapshotRow } from '../domain/types.js';
import { SnapshotStore } from './store.js';

const row = (date: string, over: Partial<SnapshotRow> = {}): SnapshotRow => ({
  date,
  projectId: 1,
  epicSlug: 'alpha',
  pointsTotal: 10.5,
  pointsDone: 0.5,
  tasksTotal: 4,
  tasksDone: 1,
  unpointedOpen: 2,
  ...over,
});

describe('SnapshotStore', () => {
  it('round trips rows, keeping decimal points and the empty slug', () => {
    const s = SnapshotStore.memory();
    s.replaceDay('2026-10-02', [row('2026-10-02'), row('2026-10-02', { epicSlug: '' })]);
    s.replaceDay('2026-10-01', [row('2026-10-01', { pointsDone: 0 })]);
    expect(s.rowsForEpic(1, 'alpha').map((r) => r.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(s.rowsForEpic(1, 'alpha')[1]).toEqual(row('2026-10-02'));
    expect(s.rowsForEpic(1, '')).toHaveLength(1);
    expect(s.rowsForEpic(2, 'alpha')).toEqual([]);
    expect(s.hasDay('2026-10-01')).toBe(true);
    expect(s.hasDay('2026-10-03')).toBe(false);
    expect(s.latestDate()).toBe('2026-10-02');
    s.close();
  });

  it('latestDate is null when empty', () => {
    expect(SnapshotStore.memory().latestDate()).toBeNull();
  });

  it('replaceDay is idempotent and replaces the whole day', () => {
    const s = SnapshotStore.memory();
    const day = [row('2026-10-05'), row('2026-10-05', { epicSlug: 'beta' })];
    s.replaceDay('2026-10-05', day);
    const first = [s.rowsForEpic(1, 'alpha'), s.rowsForEpic(1, 'beta')];
    s.replaceDay('2026-10-05', day);
    expect([s.rowsForEpic(1, 'alpha'), s.rowsForEpic(1, 'beta')]).toEqual(first);

    s.replaceDay('2026-10-05', [row('2026-10-05', { pointsTotal: 99 })]);
    expect(s.rowsForEpic(1, 'alpha')[0]?.pointsTotal).toBe(99);
    expect(s.rowsForEpic(1, 'beta')).toEqual([]);
  });

  it('persists on disk, creating the data dir', () => {
    const base = mkdtempSync(join(tmpdir(), 'snap-'));
    try {
      const dir = join(base, 'nested', 'data');
      const a = SnapshotStore.open(dir);
      a.replaceDay('2026-10-05', [row('2026-10-05')]);
      a.close();
      expect(existsSync(join(dir, 'snapshots.db'))).toBe(true);
      const b = SnapshotStore.open(dir);
      expect(b.hasDay('2026-10-05')).toBe(true);
      b.close();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
