import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildModel } from '../domain/model.js';
import { cfg, project, vtask } from '../domain/testing.js';
import { createSnapshotsHook } from './hook.js';
import { SnapshotStore } from './store.js';

const model = buildModel(
  [
    {
      project: project(1),
      tasks: [vtask(1, { project: 1, labels: ['epic:alpha', 'sp:3'] }), vtask(2, { project: 1, labels: ['sp:2'] })],
      board: null,
    },
  ],
  [project(1)],
  cfg,
);

afterEach(() => vi.useRealTimers());

describe('createSnapshotsHook', () => {
  it("writes today's rows on start and serves them back", async () => {
    vi.useFakeTimers({ now: new Date('2026-05-01T18:00:00Z') });
    const store = SnapshotStore.memory();
    const log = { info: vi.fn(), error: vi.fn() };
    const hook = createSnapshotsHook(store, { snapshotTime: '03:00', tz: 'America/Los_Angeles', log });

    const stop = hook.startDaily(() => model);
    await vi.advanceTimersByTimeAsync(0);
    stop();

    expect(store.hasDay('2026-05-01')).toBe(true);
    expect(hook.rowsForEpic(1, 'alpha')).toEqual([
      expect.objectContaining({ date: '2026-05-01', pointsTotal: 3, tasksTotal: 1 }),
    ]);
    expect(hook.rowsForEpic(1, '')[0]).toMatchObject({ pointsTotal: 2, tasksTotal: 1 });
    expect(log.error).not.toHaveBeenCalled();
  });

  it('skips and logs when nothing has synced yet', async () => {
    vi.useFakeTimers({ now: new Date('2026-05-01T18:00:00Z') });
    const store = SnapshotStore.memory();
    const log = { info: vi.fn(), error: vi.fn() };
    const stop = createSnapshotsHook(store, { snapshotTime: '03:00', tz: 'UTC', log }).startDaily(() => null);
    await vi.advanceTimersByTimeAsync(0);
    stop();

    expect(store.latestDate()).toBeNull();
    expect(log.error).toHaveBeenCalled();
  });

  it('skips (and logs) a snapshot from a stale model, then writes once the sync is fresh again', async () => {
    vi.useFakeTimers({ now: new Date('2026-05-01T18:00:00Z') });
    const store = SnapshotStore.memory();
    const log = { info: vi.fn(), error: vi.fn() };
    let fresh = false;
    const hook = createSnapshotsHook(store, { snapshotTime: '03:00', tz: 'UTC', log, isFresh: () => fresh });
    const stop = hook.startDaily(() => model);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.latestDate()).toBeNull();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.objectContaining({ message: expect.stringContaining('3 sync intervals') }));

    fresh = true;
    await vi.advanceTimersByTimeAsync(10 * 60_000); // the retry
    stop();
    expect(store.hasDay('2026-05-01')).toBe(true);
  });
});
