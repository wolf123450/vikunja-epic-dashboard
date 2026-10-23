import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SnapshotRow } from '../domain/types.js';

type DbRow = {
  date: string;
  project_id: number;
  epic_slug: string;
  points_total: number;
  points_done: number;
  tasks_total: number;
  tasks_done: number;
  unpointed_open: number;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshots (
  date TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  epic_slug TEXT NOT NULL,
  points_total REAL NOT NULL,
  points_done REAL NOT NULL,
  tasks_total INTEGER NOT NULL,
  tasks_done INTEGER NOT NULL,
  unpointed_open INTEGER NOT NULL,
  PRIMARY KEY (date, project_id, epic_slug)
)`;

/** Daily per-epic snapshots in SQLite (see SPEC.md, Burn-up history). */
export class SnapshotStore {
  private constructor(private readonly db: Database.Database) {
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
  }

  /** Open (creating the directory and `snapshots.db` if needed) under `dataDir`. */
  static open(dataDir: string): SnapshotStore {
    mkdirSync(dataDir, { recursive: true });
    return new SnapshotStore(new Database(join(dataDir, 'snapshots.db')));
  }

  /** In-memory store for tests. */
  static memory(): SnapshotStore {
    return new SnapshotStore(new Database(':memory:'));
  }

  /** Atomically replace all rows of `date` with `rows`. Idempotent. */
  replaceDay(date: string, rows: SnapshotRow[]): void {
    const del = this.db.prepare('DELETE FROM snapshots WHERE date = ?');
    const ins = this.db.prepare(
      `INSERT OR REPLACE INTO snapshots
       (date, project_id, epic_slug, points_total, points_done, tasks_total, tasks_done, unpointed_open)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      del.run(date);
      for (const r of rows) {
        ins.run(date, r.projectId, r.epicSlug, r.pointsTotal, r.pointsDone, r.tasksTotal, r.tasksDone, r.unpointedOpen);
      }
    })();
  }

  /** One epic's rows, oldest first. */
  rowsForEpic(projectId: number, epicSlug: string): SnapshotRow[] {
    const rows = this.db
      .prepare('SELECT * FROM snapshots WHERE project_id = ? AND epic_slug = ? ORDER BY date')
      .all(projectId, epicSlug) as DbRow[];
    return rows.map((r) => ({
      date: r.date,
      projectId: r.project_id,
      epicSlug: r.epic_slug,
      pointsTotal: r.points_total,
      pointsDone: r.points_done,
      tasksTotal: r.tasks_total,
      tasksDone: r.tasks_done,
      unpointedOpen: r.unpointed_open,
    }));
  }

  hasDay(date: string): boolean {
    return this.db.prepare('SELECT 1 FROM snapshots WHERE date = ? LIMIT 1').get(date) !== undefined;
  }

  latestDate(): string | null {
    const r = this.db.prepare('SELECT MAX(date) AS d FROM snapshots').get() as { d: string | null };
    return r.d;
  }

  close(): void {
    this.db.close();
  }
}
