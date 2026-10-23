import type { SyncStatus } from '../../shared/api.js';
import type { Config } from '../config.js';
import { buildModel } from '../domain/model.js';
import type { Model, ProjectData } from '../domain/types.js';
import type { VikunjaClient } from '../vikunja/client.js';
import { fetchBoard } from '../vikunja/kanban.js';
import type { VikunjaProject } from '../vikunja/schemas.js';

export type Logger = {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
};

export type SyncerConfig = Pick<
  Config,
  | 'projectIds'
  | 'includeChildProjects'
  | 'kanbanViewIds'
  | 'syncIntervalSec'
  | 'vikunjaPublicUrl'
  | 'pointsPrefix'
  | 'pointsScale'
  | 'pointsSplitThreshold'
  | 'epicMode'
  | 'epicPrefix'
  | 'epicMarkerLabel'
  | 'epicAllowOverlap'
  | 'epicParentPoints'
  | 'tz'
>;

export type SyncerOptions = {
  config: SyncerConfig;
  client: VikunjaClient;
  /** Injectable clock for tests. */
  now?: () => Date;
  logger?: Logger;
};

const BOARD_CONCURRENCY = 4;

const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

/**
 * Full-read sync loop. Keeps the latest Model and the offered project list in memory. A failed
 * sync keeps serving the previous good model and records the error in status().
 */
export class Syncer {
  private readonly cfg: SyncerConfig;
  private readonly client: VikunjaClient;
  private readonly clock: () => Date;
  private readonly log: Logger;

  private current: Model | null = null;
  private offered: VikunjaProject[] = [];
  private inFlight: Promise<SyncStatus> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private versionLogged = false;
  private state: SyncStatus = {
    lastSuccessAt: null,
    lastAttemptAt: null,
    error: null,
    vikunjaVersion: null,
    syncing: false,
  };

  constructor(opts: SyncerOptions) {
    this.cfg = opts.config;
    this.client = opts.client;
    this.clock = opts.now ?? (() => new Date());
    this.log = opts.logger ?? consoleLogger;
  }

  /** Latest successfully built model, null until the first sync succeeds. */
  get model(): Model | null {
    return this.current;
  }

  /** Projects offered in the picker (PROJECT_IDS plus descendants, or all visible), parents first. */
  get projects(): VikunjaProject[] {
    return this.offered;
  }

  get intervalMs(): number {
    return this.cfg.syncIntervalSec * 1000;
  }

  status(): SyncStatus {
    return { ...this.state, syncing: this.inFlight !== null };
  }

  /**
   * Resync now. A call while a sync is running waits for that sync instead of starting
   * another. Never rejects: failures are recorded in the returned status.
   */
  refresh(): Promise<SyncStatus> {
    if (this.inFlight) return this.inFlight;
    const run = this.runSync().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  }

  /** Run the first sync now, then every SYNC_INTERVAL_SEC. */
  start(): Promise<SyncStatus> {
    this.stop();
    this.timer = setInterval(() => void this.refresh(), this.intervalMs);
    this.timer.unref();
    return this.refresh();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runSync(): Promise<SyncStatus> {
    this.state = { ...this.state, lastAttemptAt: this.clock().toISOString() };
    try {
      const { model, offered } = await this.fullRead();
      this.current = model;
      this.offered = offered;
      this.state = { ...this.state, lastSuccessAt: this.clock().toISOString(), error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.state = { ...this.state, error: message };
      this.log.error(`sync failed: ${message}`);
    }
    return this.status();
  }

  private async fullRead(): Promise<{ model: Model; offered: VikunjaProject[] }> {
    const info = await this.client.info();
    this.state = { ...this.state, vikunjaVersion: info.version };
    if (!this.versionLogged) {
      this.versionLogged = true;
      this.log.info(`Vikunja version ${info.version}`);
      if (!/^v?2\.7\./.test(info.version)) {
        this.log.warn(`Vikunja ${info.version} is outside the tested range (v2.7.x); results may be wrong`);
      }
    }

    const all = await this.client.projects();
    const selected = selectProjects(all, this.cfg.projectIds, this.cfg.includeChildProjects);
    const tasks = selected.length
      ? await this.client.tasks({ filter: `project in ${selected.map((p) => p.id).join(', ')}` })
      : [];

    const data: ProjectData[] = [];
    for (let i = 0; i < selected.length; i += BOARD_CONCURRENCY) {
      const chunk = selected.slice(i, i + BOARD_CONCURRENCY);
      const boards = await Promise.all(
        chunk.map(async (p) =>
          fetchBoard(this.client, p.id, await this.client.views(p.id), this.cfg.kanbanViewIds.get(p.id)),
        ),
      );
      chunk.forEach((project, j) => {
        data.push({ project, tasks: tasks.filter((t) => t.project_id === project.id), board: boards[j] ?? null });
      });
    }

    return { model: buildModel(data, all, this.cfg), offered: parentsFirst(selected) };
  }
}

/** PROJECT_IDS limits the picker (plus descendants when child projects roll up); default all. */
export function selectProjects(
  all: VikunjaProject[],
  projectIds: number[] | null,
  includeChildren: boolean,
): VikunjaProject[] {
  if (!projectIds) return all;
  const wanted = new Set(projectIds);
  if (includeChildren) {
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of all) {
        if (!wanted.has(p.id) && wanted.has(p.parent_project_id)) {
          wanted.add(p.id);
          grew = true;
        }
      }
    }
  }
  return all.filter((p) => wanted.has(p.id));
}

/** Stable order with every parent before its children (parents outside the list don't count). */
export function parentsFirst(projects: VikunjaProject[]): VikunjaProject[] {
  const ids = new Set(projects.map((p) => p.id));
  const byParent = new Map<number, VikunjaProject[]>();
  for (const p of projects) {
    const parent = ids.has(p.parent_project_id) && p.parent_project_id !== p.id ? p.parent_project_id : 0;
    byParent.set(parent, [...(byParent.get(parent) ?? []), p]);
  }
  const out: VikunjaProject[] = [];
  const seen = new Set<number>();
  const walk = (parent: number) => {
    for (const p of byParent.get(parent) ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
      walk(p.id);
    }
  };
  walk(0);
  for (const p of projects) if (!seen.has(p.id)) out.push(p); // cycles in bad data
  return out;
}
