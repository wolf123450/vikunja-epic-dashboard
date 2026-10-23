import { beforeEach, describe, expect, it } from 'vitest';
import type {
  EpicDetailResponse,
  EpicsResponse,
  HealthResponse,
  HygieneResponse,
  ProjectsResponse,
  SyncStatus,
  VelocityResponse,
} from '../../shared/api.js';
import { loadConfig } from '../config.js';
import type { SnapshotRow } from '../domain/types.js';
import { createFakeVikunja, type FakeVikunja } from '../sync/fake-vikunja.js';
import { Syncer } from '../sync/syncer.js';
import { buildApp, HYGIENE_GROUPS } from './index.js';

// End to end through the real client, syncer, domain layer and routes against an in-memory
// Vikunja. Needs the real domain functions (server/domain), not the m3 stubs.

const NOW = new Date('2026-10-20T12:00:00Z');
const config = loadConfig({
  VIKUNJA_API_URL: 'http://vikunja.example',
  VIKUNJA_TOKEN: 'secret',
  TZ: 'UTC',
  SYNC_INTERVAL_SEC: '60',
  POINTS_SPLIT_THRESHOLD: '5',
});

let fake: FakeVikunja;
let syncer: Syncer;
let snapshotCalls: [number, string][];
let snapshotRows: SnapshotRow[];
let app: ReturnType<typeof buildApp>;

beforeEach(async () => {
  fake = createFakeVikunja();
  snapshotCalls = [];
  snapshotRows = [];
  syncer = new Syncer({ config, client: fake.client, now: () => NOW, logger: { info() {}, warn() {}, error() {} } });
  app = buildApp({
    config,
    syncer,
    now: () => NOW,
    snapshotRowsForEpic: (p, s) => {
      snapshotCalls.push([p, s]);
      return snapshotRows;
    },
  });
});

const get = async <T>(url: string) => {
  const res = await app.inject(url);
  return { code: res.statusCode, body: res.json<T>() };
};

describe('before the first sync', () => {
  it('returns 503 with the sync status', async () => {
    const { code, body } = await get<{ error: string; sync: SyncStatus }>('/api/epics');
    expect(code).toBe(503);
    expect(body.sync.lastSuccessAt).toBeNull();
  });
});

describe('PROJECT_IDS naming a child project', () => {
  it('roots the child at itself, so the default selection and filters work', async () => {
    const childConfig = loadConfig({
      VIKUNJA_API_URL: 'http://vikunja.example',
      VIKUNJA_TOKEN: 'secret',
      TZ: 'UTC',
      PROJECT_IDS: '2',
    });
    const childSyncer = new Syncer({ config: childConfig, client: fake.client, now: () => NOW, logger: { info() {}, warn() {}, error() {} } });
    await childSyncer.refresh();
    const childApp = buildApp({ config: childConfig, syncer: childSyncer, now: () => NOW });
    const projects = (await childApp.inject('/api/projects')).json<ProjectsResponse>();
    expect(projects.projects.map((p) => p.id)).toEqual([2]);
    expect(projects.projects[0]).toMatchObject({ id: 2, rootId: 2 });
    expect(projects.defaultSelection).toEqual([2]);
    for (const url of ['/api/epics?projects=2', '/api/hygiene?projects=2', '/api/velocity?projects=2', '/api/epics']) {
      expect((await childApp.inject(url)).statusCode, url).toBe(200);
    }
    const epics = (await childApp.inject('/api/epics?projects=2')).json<EpicsResponse>();
    expect(epics.epics.find((e) => e.slug === 'foo')).toMatchObject({ key: '2:foo', rootProjectId: 2, rootProjectTitle: 'Alpha Child' });
    expect(projects.projects[0]!.epicCount).toBe(1);
    expect((await childApp.inject('/api/epics?projects=1')).statusCode).toBe(400);
  });
});

describe('after a sync', () => {
  beforeEach(async () => {
    await syncer.refresh();
  });

  it('serves projects with epic counts and a default selection', async () => {
    const { code, body } = await get<ProjectsResponse>('/api/projects');
    expect(code).toBe(200);
    expect(body.projects.map((p) => p.id)).toEqual([1, 2, 3]);
    const alpha = body.projects.find((p) => p.id === 1)!;
    expect(alpha).toMatchObject({ parentId: null, rootId: 1 });
    expect(alpha.epicCount).toBeGreaterThan(0);
    const child = body.projects.find((p) => p.id === 2)!;
    expect(child).toMatchObject({ parentId: 1, rootId: 1, epicCount: 0 });
    expect(body.defaultSelection).toEqual([1, 3]);
    expect(body.sync.lastSuccessAt).toBe(NOW.toISOString());
    expect(body.sync.vikunjaVersion).toBe('v2.7.0');
  });

  it('serves the epic overview with No-epic rows last, one per selected root', async () => {
    const { code, body } = await get<EpicsResponse>('/api/epics');
    expect(code).toBe(200);
    const noEpic = body.epics.filter((e) => e.isNoEpic);
    expect(noEpic.map((e) => e.key)).toEqual(['1:', '3:']);
    expect(body.epics.slice(-2).every((e) => e.isNoEpic)).toBe(true);
    expect(noEpic[0]).toMatchObject({ name: 'No epic', slug: '', source: null, parentTask: null });

    // foo in Alpha and its child merge; Beta's foo stays separate.
    const foos = body.epics.filter((e) => e.slug === 'foo');
    expect(foos.map((e) => e.key).sort()).toEqual(['1:foo', '3:foo']);
    expect(foos.find((e) => e.key === '1:foo')!.rollup).toMatchObject({ tasksTotal: 3, pointsTotal: 11, pointsDone: 3 });

    expect(body.velocity).toHaveLength(12);
    expect(body.totals.tasksTotal).toBe(7);
    expect(body.buckets.map((b) => b.name)).toContain('Backlog');
    for (const b of body.buckets) expect(b.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('merges buckets by key across roots and appends unmatched child buckets', async () => {
    const one = await get<EpicsResponse>('/api/epics?projects=1');
    expect(one.body.buckets.map((b) => b.name)).toEqual(['Backlog', 'Done', 'Review']);
    expect(one.body.buckets.map((b) => b.position)).toEqual([0, 1, 2]);
    const both = await get<EpicsResponse>('/api/epics?projects=1,3');
    expect(both.body.buckets.map((b) => b.key)).toEqual(['backlog', 'done', 'review', 'todo']);
    expect(both.body.buckets.find((b) => b.key === 'done')!.isDone).toBe(true);
  });

  it('maps child project ids to their rollup root and de-duplicates', async () => {
    const viaChild = await get<EpicsResponse>('/api/epics?projects=2');
    const viaRoot = await get<EpicsResponse>('/api/epics?projects=1');
    const both = await get<EpicsResponse>('/api/epics?projects=1,2');
    expect(viaChild.body).toEqual(viaRoot.body);
    expect(both.body).toEqual(viaRoot.body);
  });

  it('rejects invalid project ids with 400', async () => {
    for (const q of ['abc', '1,x', '999', '-3', '1.5']) {
      for (const base of ['/api/epics', '/api/hygiene', '/api/velocity', '/api/epics/1:foo']) {
        const res = await get<{ error: string }>(`${base}?projects=${q}`);
        expect(res.code, `${base}?projects=${q}`).toBe(400);
        expect(res.body.error).toBeTruthy();
      }
    }
    expect((await get('/api/projects/abc/epics')).code).toBe(400);
    expect((await get('/api/projects/999/hygiene')).code).toBe(400);
  });

  it('single-project aliases equal the multi form with one id', async () => {
    const same = async (alias: string, multi: string) => {
      const a = await get<unknown>(alias);
      const b = await get<unknown>(multi);
      expect(a.code, alias).toBe(200);
      expect(a.body, alias).toEqual(b.body);
    };
    await same('/api/projects/3/epics', '/api/epics?projects=3');
    await same('/api/projects/1/epics/foo', '/api/epics/1%3Afoo?projects=1');
    await same('/api/projects/1/hygiene', '/api/hygiene?projects=1');
    await same('/api/projects/1/velocity', '/api/velocity?projects=1');
  });

  it('serves epic detail with members, bucket legend, forecast, and burn-up', async () => {
    const { code, body } = await get<EpicDetailResponse>('/api/epics/1%3Afoo');
    expect(code).toBe(200);
    expect(body.epic).toMatchObject({ key: '1:foo', slug: 'foo', name: 'Foo', isNoEpic: false, rootProjectId: 1, rootProjectTitle: 'Alpha' });
    expect(body.tasks.map((t) => t.id).sort()).toEqual([1, 2, 3]);
    const t1 = body.tasks.find((t) => t.id === 1)!;
    expect(t1).toMatchObject({ ref: expect.any(String), done: true, points: 3, bucketKey: 'done', doneAt: '2026-10-05T12:00:00.000Z' });
    expect(t1.url).toBe('http://vikunja.example/tasks/1');
    expect(body.burnup.length).toBeGreaterThan(0);
    expect(body.burnup.every((p) => p.source === 'reconstructed')).toBe(true);
    expect(snapshotCalls).toEqual([[1, 'foo']]);
    expect(body).toHaveProperty('forecast');
  });

  it('merges snapshot rows into the burn-up', async () => {
    snapshotRows = [
      { date: '2026-10-18', projectId: 1, epicSlug: 'foo', pointsTotal: 11, pointsDone: 3, tasksTotal: 3, tasksDone: 1, unpointedOpen: 1 },
    ];
    const { body } = await get<EpicDetailResponse>('/api/epics/1%3Afoo');
    expect(body.burnup.some((p) => p.source === 'snapshot')).toBe(true);
  });

  it("replaces today's burn-up point with the live rollup, marked snapshot only when snapshots exist", async () => {
    const live = { scopePoints: 11, donePoints: 3, scopeTasks: 3, doneTasks: 1 };
    const without = await get<EpicDetailResponse>('/api/epics/1%3Afoo');
    expect(without.body.burnup.at(-1)).toMatchObject({ date: '2026-10-20', ...live, source: 'reconstructed' });

    // Stale snapshot (two days old, different numbers): today still shows the live state.
    snapshotRows = [
      { date: '2026-10-18', projectId: 1, epicSlug: 'foo', pointsTotal: 5, pointsDone: 0, tasksTotal: 2, tasksDone: 0, unpointedOpen: 1 },
    ];
    const withSnap = await get<EpicDetailResponse>('/api/epics/1%3Afoo');
    const byDate = Object.fromEntries(withSnap.body.burnup.map((p) => [p.date, p]));
    expect(byDate['2026-10-18']).toMatchObject({ scopePoints: 5, source: 'snapshot' });
    expect(byDate['2026-10-19']).toMatchObject({ source: 'reconstructed' });
    expect(byDate['2026-10-20']).toMatchObject({ ...live, source: 'snapshot' });
  });

  it('serves the No-epic detail and 404s unknown epics', async () => {
    const ok = await get<EpicDetailResponse>('/api/epics/1%3A');
    expect(ok.code).toBe(200);
    expect(ok.body.epic).toMatchObject({ isNoEpic: true, key: '1:' });
    expect(snapshotCalls).toEqual([[1, '']]);
    expect((await get('/api/epics/1%3Anope')).code).toBe(404);
    expect((await get('/api/epics/garbage')).code).toBe(404);
    expect((await get('/api/projects/1/epics/nope')).code).toBe(404);
  });

  it('serves hygiene groups in the fixed order, non-empty only, with labels', async () => {
    const { code, body } = await get<HygieneResponse>('/api/hygiene');
    expect(code).toBe(200);
    const order = HYGIENE_GROUPS.map((g) => g.type);
    const types = body.groups.map((g) => g.type);
    expect(types.length).toBeGreaterThan(0);
    expect(types).toEqual(order.filter((t) => types.includes(t)));
    for (const g of body.groups) {
      expect(g.tasks.length).toBeGreaterThan(0);
      expect(g.label).toBeTruthy();
    }
    // Task 2 has 8 points (> threshold 5); task 5 has an invalid sp: label.
    expect(body.groups.find((g) => g.type === 'oversized')!.tasks.map((t) => t.id)).toContain(2);
    expect(body.groups.find((g) => g.type === 'invalid-points')!.tasks.map((t) => t.id)).toContain(5);
    expect(body.unmatchedBuckets).toEqual([{ projectId: 2, projectTitle: 'Alpha Child', bucketName: 'Review' }]);
  });

  it('serves velocity for a project set or for one epic', async () => {
    const all = await get<VelocityResponse>('/api/velocity');
    expect(all.code).toBe(200);
    expect(all.body.weeks).toHaveLength(12);
    expect(all.body.weeks.reduce((s, w) => s + w.points, 0)).toBe(8);
    const epic = await get<VelocityResponse>('/api/velocity?projects=1&epic=1%3Afoo');
    expect(epic.body.weeks.reduce((s, w) => s + w.points, 0)).toBe(3);
    expect((await get('/api/velocity?epic=1%3Anope')).code).toBe(404);
  });

  it('POST /api/refresh resyncs and returns the status', async () => {
    const before = fake.syncsStarted();
    const res = await app.inject({ method: 'POST', url: '/api/refresh' });
    expect(res.statusCode).toBe(200);
    expect(res.json<SyncStatus>()).toMatchObject({ error: null, syncing: false, lastSuccessAt: NOW.toISOString() });
    expect(fake.syncsStarted()).toBe(before + 1);
  });

  it('keeps serving the last good model after a failed sync and reports it on /healthz', async () => {
    fake.world.failStatus = 401;
    const res = await app.inject({ method: 'POST', url: '/api/refresh' });
    expect(res.json<SyncStatus>().error).toMatch(/HTTP 401/);
    expect((await get('/api/epics')).code).toBe(200);
    expect((await get<EpicsResponse>('/api/epics')).body.sync.error).toMatch(/HTTP 401/);
    // Still within 3 intervals, so healthy but the error is visible.
    const health = await get<HealthResponse>('/healthz');
    expect(health.code).toBe(200);
    expect(health.body.sync.error).toMatch(/revoked/);
  });
});
