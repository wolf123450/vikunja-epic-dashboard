import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VikunjaClient } from './client.js';

// Replays scrubbed responses recorded from a real Vikunja v2.7.0 (npm run fixtures:record)
// through the client, so schema drift shows up here rather than in production.

const dir = join(import.meta.dirname, '..', '..', 'fixtures');
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
  projectId: number;
  entries: { file: string; path: string; pagination: Record<string, string> }[];
};
const load = (file: string): unknown => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const pid = manifest.projectId;

/** Serves each recorded file by path and `filter`; paging params are ignored. */
function replay(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const entry = manifest.entries.find((e) => {
      const rec = new URL(e.path, 'http://x');
      return rec.pathname === path && rec.searchParams.get('filter') === url.searchParams.get('filter');
    });
    if (!entry) return new Response(`no fixture for ${url.pathname}${url.search}`, { status: 404 });
    // Report a single page so getAll stops after the recorded one.
    return new Response(JSON.stringify(load(entry.file)), { headers: { 'x-pagination-total-pages': '1' } });
  }) as typeof fetch;
}

const client = () => new VikunjaClient({ baseUrl: 'http://vikunja.example', token: 't', fetch: replay() });

describe('recorded fixtures', () => {
  it('parse info and projects, dropping pseudo-projects', async () => {
    const c = client();
    expect((await c.info()).version).toBe('v2.7.0');
    const projects = await c.projects();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((p) => p.id > 0)).toBe(true);
    expect(projects.find((p) => p.id === pid)?.views.length).toBeGreaterThan(0);
  });

  it('parse views and the Kanban bucket listing', async () => {
    const c = client();
    const views = await c.views(pid);
    const kanban = views.find((v) => v.view_kind === 'kanban');
    expect(kanban).toBeDefined();
    const buckets = await c.kanbanBuckets(pid, kanban!.id);
    expect(buckets.length).toBeGreaterThan(0);
    for (const b of buckets) expect(b.tasks.length).toBeLessThanOrEqual(b.count);
    expect(buckets.some((b) => b.id === kanban!.done_bucket_id)).toBe(true);
  });

  it('parse a filtered bucket page as task ids', async () => {
    const entry = manifest.entries.find((e) => e.file === 'kanban-bucket-page1.json');
    if (!entry) return;
    const m = /views\/(\d+)\/tasks\?filter=bucket_id%20%3D%20(\d+)/.exec(entry.path)!;
    const ids = await client().bucketTaskIds(pid, Number(m[1]), Number(m[2]));
    expect(ids.length).toBe(Number(entry.pagination['x-pagination-result-count']));
  });

  it('parse tasks with dates, labels, and relations', async () => {
    const tasks = await client().tasks({ filter: `project in ${pid}` });
    expect(tasks.length).toBe(50);
    const open = tasks.find((t) => !t.done);
    const done = tasks.find((t) => t.done);
    if (open) expect(open.done_at).toBeNull();
    if (done) expect(done.done_at).toBeInstanceOf(Date);
    expect(tasks.every((t) => t.created instanceof Date && Array.isArray(t.labels))).toBe(true);
  });

  it('parse labels', async () => {
    const labels = await client().labels();
    expect(labels.length).toBeGreaterThan(0);
  });
});
