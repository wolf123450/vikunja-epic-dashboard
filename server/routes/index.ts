// Dashboard REST routes. The contract lives in shared/api.ts; keep this file in step with its header.

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type {
  EpicDetailResponse,
  EpicDTO,
  EpicsResponse,
  ErrorResponse,
  FlagType,
  ForecastDTO,
  HealthResponse,
  HygieneResponse,
  ProjectDTO,
  ProjectsResponse,
  SyncStatus,
  VelocityResponse,
} from '../../shared/api.js';
import type { Config } from '../config.js';
import { mergeBurnup } from '../domain/snapshot-merge.js';
import { reconstructBurnup } from '../domain/burnup.js';
import { compareRollups, epicTasks, noEpicTasks, rollup } from '../domain/rollup.js';
import { forecast, velocity } from '../domain/velocity.js';
import type { Model, SnapshotRow, Task } from '../domain/types.js';
import type { Syncer } from '../sync/syncer.js';
import { epicDTO, mergedBuckets, noEpicDTO, rollupDTO, taskDTO } from './dto.js';

export type SnapshotRowsProvider = (projectId: number, epicSlug: string) => SnapshotRow[] | Promise<SnapshotRow[]>;

export type RouteDeps = {
  config: Pick<Config, 'tz' | 'bucketColors' | 'syncIntervalSec'>;
  syncer: Pick<Syncer, 'model' | 'projects' | 'status' | 'refresh' | 'intervalMs'>;
  /** Snapshot store hook (milestone 5). Default: no snapshots, so burn-up is reconstructed only. */
  snapshotRowsForEpic?: SnapshotRowsProvider;
  now?: () => Date;
};

/** Hygiene groups, in display order. */
export const HYGIENE_GROUPS: { type: FlagType; label: string }[] = [
  { type: 'oversized', label: 'Oversized tasks (consider splitting or promoting to an epic)' },
  { type: 'unpointed-open', label: 'Open tasks without points' },
  { type: 'no-epic', label: 'Tasks in no epic' },
  { type: 'invalid-points', label: 'Invalid story-point labels' },
  { type: 'off-scale-points', label: 'Points off the configured scale' },
  { type: 'done-bucket-mismatch', label: 'Done flag disagrees with the done bucket' },
  { type: 'conflicting-points', label: 'Conflicting story-point labels' },
  { type: 'subtask-cycle', label: 'Subtask cycles' },
  { type: 'epic-overlap', label: 'Tasks in more than one epic' },
];

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function buildApp(deps: RouteDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  registerRoutes(app, deps);
  return app;
}

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { syncer, config } = deps;
  const now = deps.now ?? (() => new Date());
  const snapshotRows = deps.snapshotRowsForEpic ?? (() => []);

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message } satisfies ErrorResponse);
    app.log.error(err);
    return reply.code(500).send({ error: err instanceof Error ? err.message : 'internal error' } satisfies ErrorResponse);
  });

  // ---- shared lookups -----------------------------------------------------------------

  const titles = () => new Map(syncer.projects.map((p) => [p.id, p.title]));
  const titleOf = (): ((id: number) => string) => {
    const t = titles();
    return (id) => t.get(id) ?? `Project ${id}`;
  };

  const rootOf = (model: Model, id: number): number => model.rootOf.get(id) ?? id;

  const offeredIds = (): Set<number> => new Set(syncer.projects.map((p) => p.id));

  /** Roots with epics/tasks offered in the picker, in picker order. */
  const defaultRoots = (model: Model): number[] => {
    const roots: number[] = [];
    for (const p of syncer.projects) {
      const r = rootOf(model, p.id);
      if (!roots.includes(r)) roots.push(r);
    }
    return roots;
  };

  const parseId = (raw: string, what: string): number => {
    if (!/^\d+$/.test(raw)) throw new HttpError(400, `invalid ${what}: "${raw}"`);
    return Number(raw);
  };

  /** `projects` query value -> rollup roots. Omitted = every offered project. */
  const rootsFromQuery = (model: Model, raw: string | undefined): number[] => {
    if (raw === undefined || raw.trim() === '') return defaultRoots(model);
    const offered = offeredIds();
    const roots: number[] = [];
    for (const part of raw.split(',')) {
      const id = parseId(part.trim(), 'project id');
      if (!offered.has(id)) throw new HttpError(400, `unknown project id: ${id}`);
      const r = rootOf(model, id);
      if (!roots.includes(r)) roots.push(r);
    }
    return roots;
  };

  const rootsOfId = (model: Model, rawId: string): number[] => {
    const id = parseId(rawId, 'project id');
    if (!offeredIds().has(id)) throw new HttpError(400, `unknown project id: ${id}`);
    return [rootOf(model, id)];
  };

  const tasksOfRoots = (model: Model, roots: number[]): Task[] =>
    model.tasks.filter((t) => roots.includes(t.rootProjectId));

  const forecastFor = (tasks: Task[]): ForecastDTO => {
    const r = rollup(tasks);
    return forecast(r.pointsTotal - r.pointsDone, velocity(tasks, config.tz, now()));
  };

  // ---- response builders --------------------------------------------------------------

  const epicsResponse = (model: Model, roots: number[]): EpicsResponse => {
    const title = titleOf();
    const real = model.epics
      .filter((e) => roots.includes(e.rootProjectId))
      .map((e) => ({ epic: e, rollup: rollup(epicTasks(model, e.key)) }))
      .sort((a, b) => compareRollups(a.rollup, b.rollup) || a.epic.name.localeCompare(b.epic.name));
    const epics: EpicDTO[] = real.map((r) => epicDTO(model, r.epic, r.rollup, title));
    for (const root of roots) epics.push(noEpicDTO(root, rollup(noEpicTasks(model, root)), title));
    const tasks = tasksOfRoots(model, roots);
    return {
      buckets: mergedBuckets(model, roots, config.bucketColors),
      epics,
      totals: rollupDTO(rollup(tasks)),
      velocity: velocity(tasks, config.tz, now(), 12),
      sync: syncer.status(),
    };
  };

  /** Epic key (`root:slug`, slug '' = No epic) -> its members and DTO, or 404. */
  const resolveEpic = (model: Model, key: string) => {
    const idx = key.indexOf(':');
    const root = idx > 0 && /^\d+$/.test(key.slice(0, idx)) ? Number(key.slice(0, idx)) : NaN;
    if (Number.isNaN(root)) throw new HttpError(404, `unknown epic: ${key}`);
    const slug = key.slice(idx + 1);
    const title = titleOf();
    if (slug === '') {
      if (!defaultRoots(model).includes(root)) throw new HttpError(404, `unknown epic: ${key}`);
      const members = noEpicTasks(model, root);
      return { root, slug, members, dto: noEpicDTO(root, rollup(members), title) };
    }
    const epic = model.epics.find((e) => e.key === key);
    if (!epic) throw new HttpError(404, `unknown epic: ${key}`);
    const members = epicTasks(model, key);
    return { root, slug, members, dto: epicDTO(model, epic, rollup(members), title) };
  };

  const epicDetail = async (model: Model, key: string): Promise<EpicDetailResponse> => {
    const { root, slug, members, dto } = resolveEpic(model, key);
    const burnup = mergeBurnup(reconstructBurnup(members, config.tz, now()), await snapshotRows(root, slug));
    return {
      epic: dto,
      buckets: mergedBuckets(model, [root], config.bucketColors),
      tasks: members.map(taskDTO),
      burnup,
      forecast: forecastFor(members),
      sync: syncer.status(),
    };
  };

  const hygieneResponse = (model: Model, roots: number[]): HygieneResponse => {
    const tasks = tasksOfRoots(model, roots);
    const groups = HYGIENE_GROUPS.map(({ type, label }) => ({
      type,
      label,
      tasks: tasks.filter((t) => t.flags.some((f) => f.type === type)).map(taskDTO),
    })).filter((g) => g.tasks.length > 0);
    const title = titleOf();
    return {
      groups,
      unmatchedBuckets: model.unmatchedBuckets
        .filter((u) => roots.includes(u.rootProjectId))
        .map((u) => ({ projectId: u.projectId, projectTitle: title(u.projectId), bucketName: u.bucketName })),
      sync: syncer.status(),
    };
  };

  const velocityResponse = (model: Model, roots: number[], epicKey: string | undefined): VelocityResponse => {
    let tasks = tasksOfRoots(model, roots);
    if (epicKey) {
      // The single-project alias also accepts a bare slug.
      const key = epicKey.includes(':') ? epicKey : `${roots[0]}:${epicKey}`;
      tasks = resolveEpic(model, key).members;
    }
    return { weeks: velocity(tasks, config.tz, now(), 12), forecast: forecastFor(tasks), sync: syncer.status() };
  };

  const projectsResponse = (model: Model): ProjectsResponse => {
    const projects: ProjectDTO[] = syncer.projects.map((p) => ({
      id: p.id,
      title: p.title,
      parentId: p.parent_project_id > 0 ? p.parent_project_id : null,
      rootId: rootOf(model, p.id),
      epicCount: model.epics.filter((e) => e.rootProjectId === p.id).length,
      taskCount: model.tasks.filter((t) => t.projectId === p.id).length,
    }));
    return { projects, defaultSelection: defaultRoots(model), sync: syncer.status() };
  };

  // ---- route wiring -------------------------------------------------------------------

  type Q = Record<string, string | undefined>;
  type P = Record<string, string>;

  /** 503 { error, sync } until the first sync has succeeded. */
  const guarded =
    <T>(fn: (model: Model, req: FastifyRequest<{ Querystring: Q; Params: P }>) => T | Promise<T>) =>
    async (req: FastifyRequest<{ Querystring: Q; Params: P }>, reply: FastifyReply) => {
      const model = syncer.model;
      if (!model) {
        return reply
          .code(503)
          .send({ error: 'no successful sync yet', sync: syncer.status() } satisfies ErrorResponse);
      }
      return fn(model, req);
    };

  app.get('/api/projects', guarded((model) => projectsResponse(model)));

  const epicsList = guarded((model, req) => epicsResponse(model, rootsFromQuery(model, req.query.projects)));
  app.get('/api/epics', epicsList);
  app.get('/api/projects/:id/epics', guarded((model, req) => epicsResponse(model, rootsOfId(model, req.params.id!))));

  app.get(
    '/api/epics/:key',
    guarded((model, req) => {
      rootsFromQuery(model, req.query.projects); // validates the filter even though the key names the root
      return epicDetail(model, req.params.key!);
    }),
  );
  app.get(
    '/api/projects/:id/epics/:slug',
    guarded((model, req) => {
      const [root] = rootsOfId(model, req.params.id!);
      return epicDetail(model, `${root}:${req.params.slug!}`);
    }),
  );

  app.get('/api/hygiene', guarded((model, req) => hygieneResponse(model, rootsFromQuery(model, req.query.projects))));
  app.get('/api/projects/:id/hygiene', guarded((model, req) => hygieneResponse(model, rootsOfId(model, req.params.id!))));

  app.get(
    '/api/velocity',
    guarded((model, req) => velocityResponse(model, rootsFromQuery(model, req.query.projects), req.query.epic)),
  );
  app.get(
    '/api/projects/:id/velocity',
    guarded((model, req) => velocityResponse(model, rootsOfId(model, req.params.id!), req.query.epic)),
  );

  app.post('/api/refresh', async (): Promise<SyncStatus> => syncer.refresh());

  app.get('/healthz', async (_req, reply) => {
    const sync = syncer.status();
    const body = (ok: boolean, reason: string | null): HealthResponse => ({ ok, reason, sync });
    if (!sync.lastSuccessAt) {
      return reply.code(503).send(body(false, sync.error ?? 'no sync has completed yet'));
    }
    const ageMs = now().getTime() - new Date(sync.lastSuccessAt).getTime();
    const limitMs = 3 * syncer.intervalMs;
    if (ageMs > limitMs) {
      const secs = Math.round(ageMs / 1000);
      const why = `last successful sync was ${secs}s ago (limit ${limitMs / 1000}s)`;
      return reply.code(503).send(body(false, sync.error ? `${why}; last error: ${sync.error}` : why));
    }
    return reply.send(body(true, null));
  });
}
