import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { HealthResponse, SyncStatus } from '../../shared/api.js';
import { loadConfig } from '../config.js';
import { createFakeVikunja } from '../sync/fake-vikunja.js';
import { Syncer } from '../sync/syncer.js';
import { buildApp } from './index.js';

// These tests use a stub syncer so they don't depend on the domain layer.

const INTERVAL = 60;
const T0 = new Date('2026-10-20T12:00:00Z');

function stubApp(sync: Partial<SyncStatus>, now: Date) {
  const status: SyncStatus = {
    lastSuccessAt: null,
    lastAttemptAt: null,
    error: null,
    vikunjaVersion: null,
    syncing: false,
    ...sync,
  };
  const syncer = {
    model: null,
    projects: [],
    intervalMs: INTERVAL * 1000,
    status: () => status,
    refresh: async () => status,
  };
  return buildApp({
    config: { tz: 'UTC', bucketColors: new Map(), syncIntervalSec: INTERVAL },
    syncer,
    now: () => now,
  });
}

const health = async (app: FastifyInstance) => {
  const res = await app.inject('/healthz');
  return { code: res.statusCode, body: res.json<HealthResponse>() };
};

describe('/healthz', () => {
  it('is 503 before any sync', async () => {
    const { code, body } = await health(stubApp({}, T0));
    expect(code).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/no sync/);
  });

  it('is 200 within 3 intervals of the last success', async () => {
    const last = new Date(T0.getTime() - 3 * INTERVAL * 1000);
    const { code, body } = await health(stubApp({ lastSuccessAt: last.toISOString() }, T0));
    expect(code).toBe(200);
    expect(body).toMatchObject({ ok: true, reason: null });
  });

  it('is 503 and says stale after 3 intervals, including the last error', async () => {
    const last = new Date(T0.getTime() - 3 * INTERVAL * 1000 - 1000);
    const { code, body } = await health(stubApp({ lastSuccessAt: last.toISOString(), error: 'boom' }, T0));
    expect(code).toBe(503);
    expect(body.reason).toMatch(/last successful sync was/);
    expect(body.reason).toMatch(/boom/);
  });

  it('reports a revoked token (401) as the reason when no sync ever succeeded', async () => {
    const fake = createFakeVikunja();
    fake.world.failStatus = 401;
    const config = loadConfig({ VIKUNJA_API_URL: 'http://vikunja.example', VIKUNJA_TOKEN: 'secret', TZ: 'UTC' });
    const syncer = new Syncer({
      config,
      client: fake.client,
      now: () => T0,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    await syncer.refresh();
    const app = buildApp({ config, syncer, now: () => T0 });
    const { code, body } = await health(app);
    expect(code).toBe(503);
    expect(body.reason).toMatch(/HTTP 401/);
    expect(body.sync.error).toBe(body.reason);
  });
});

describe('before the first sync', () => {
  it('data routes answer 503 { error, sync }', async () => {
    const app = stubApp({}, T0);
    for (const url of ['/api/projects', '/api/epics', '/api/epics/1:foo', '/api/hygiene', '/api/velocity', '/api/projects/1/epics']) {
      const res = await app.inject(url);
      expect(res.statusCode, url).toBe(503);
      const body = res.json<{ error: string; sync: SyncStatus }>();
      expect(body.error).toBeTruthy();
      expect(body.sync.lastSuccessAt).toBeNull();
    }
  });
});
