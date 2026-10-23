import { snapshotRows } from '../domain/snapshot.js';
import type { Model, SnapshotRow } from '../domain/types.js';
import { startDailySnapshots } from './schedule.js';
import type { SnapshotStore } from './store.js';

type Log = { info: (msg: string) => void; error: (msg: string, err?: unknown) => void };

export type SnapshotsHook = {
  rowsForEpic(projectId: number, epicSlug: string): SnapshotRow[];
  /** Start the daily snapshot job; returns a function that stops it. */
  startDaily(getModel: () => Model | null): () => void;
};

/** Connects the SQLite store and daily scheduler to the server's snapshot hook point. */
export function createSnapshotsHook(
  store: SnapshotStore,
  opts: { snapshotTime: string; tz: string; log: Log },
): SnapshotsHook {
  return {
    rowsForEpic: (projectId, epicSlug) => store.rowsForEpic(projectId, epicSlug),
    startDaily(getModel: () => Model | null) {
      const job = startDailySnapshots({
        snapshotTime: opts.snapshotTime,
        tz: opts.tz,
        hasDay: (date) => store.hasDay(date),
        run: async (date) => {
          const model = getModel();
          if (!model) throw new Error('no synced data yet; snapshot skipped');
          const rows = snapshotRows(model, date);
          store.replaceDay(date, rows);
          opts.log.info(`snapshot ${date}: ${rows.length} rows`);
        },
        log: opts.log,
      });
      return () => job.stop();
    },
  };
}
