import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { createFakeVikunja } from './fake-vikunja.js';
import { Syncer, parentsFirst, selectProjects } from './syncer.js';
import type { VikunjaProject } from '../vikunja/schemas.js';

const env = { VIKUNJA_API_URL: 'http://vikunja.example', VIKUNJA_TOKEN: 'secret', TZ: 'UTC' };
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

describe('Syncer (domain-independent)', () => {
  it('coalesces concurrent refreshes into one sync', async () => {
    const fake = createFakeVikunja();
    let open!: () => void;
    fake.world.gate = new Promise<void>((r) => (open = r));
    const syncer = new Syncer({ config: loadConfig(env), client: fake.client, logger: quiet });

    const a = syncer.refresh();
    const b = syncer.refresh();
    expect(syncer.status().syncing).toBe(true);
    open();
    const [sa, sb] = await Promise.all([a, b]);

    expect(fake.syncsStarted()).toBe(1);
    expect(sa).toEqual(sb);
    expect(syncer.status().syncing).toBe(false);

    await syncer.refresh();
    expect(fake.syncsStarted()).toBe(2);
  });

  it('records a revoked token as a clear error without throwing', async () => {
    const fake = createFakeVikunja();
    fake.world.failStatus = 401;
    const syncer = new Syncer({ config: loadConfig(env), client: fake.client, logger: quiet });
    const status = await syncer.refresh();
    expect(status.error).toMatch(/HTTP 401/);
    expect(status.error).toMatch(/revoked/);
    expect(status.lastSuccessAt).toBeNull();
    expect(status.lastAttemptAt).not.toBeNull();
    expect(syncer.model).toBeNull();
  });

  it('logs the version once and warns outside v2.7.x', async () => {
    const fake = createFakeVikunja();
    fake.world.version = 'v2.9.0';
    const lines: string[] = [];
    const logger = { info: (m: string) => lines.push(`info:${m}`), warn: (m: string) => lines.push(`warn:${m}`), error: () => {} };
    const syncer = new Syncer({ config: loadConfig(env), client: fake.client, logger });
    await syncer.refresh();
    await syncer.refresh();
    expect(lines.filter((l) => l.startsWith('info:Vikunja version'))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith('warn:'))).toHaveLength(1);
    expect(syncer.status().vikunjaVersion).toBe('v2.9.0');
  });
});

const proj = (id: number, parent: number): VikunjaProject => ({
  id,
  title: `P${id}`,
  identifier: '',
  parent_project_id: parent,
  is_archived: false,
  position: id,
  views: [],
});

describe('project selection', () => {
  const all = [proj(3, 0), proj(2, 1), proj(1, 0), proj(4, 2)];

  it('defaults to all visible projects', () => {
    expect(selectProjects(all, null, true)).toHaveLength(4);
  });

  it('PROJECT_IDS adds descendants only when child projects roll up', () => {
    expect(selectProjects(all, [1], true).map((p) => p.id).sort()).toEqual([1, 2, 4]);
    expect(selectProjects(all, [1], false).map((p) => p.id)).toEqual([1]);
  });

  it('orders parents before children', () => {
    const ids = parentsFirst(all).map((p) => p.id);
    expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
    expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(4));
  });
});
