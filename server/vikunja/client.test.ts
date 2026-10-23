import { describe, expect, it } from 'vitest';
import { VikunjaClient, VikunjaHttpError, VikunjaSchemaError } from './client.js';

const task = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  identifier: `#${id}`,
  index: id,
  title: `Task ${id}`,
  project_id: 1,
  done: false,
  done_at: '0001-01-01T00:00:00Z',
  created: '2026-01-01T00:00:00Z',
  updated: '2026-01-02T00:00:00Z',
  labels: null,
  related_tasks: {},
  ...extra,
});

type Route = (url: URL) => { status?: number; body: unknown; headers?: Record<string, string> };

function fakeFetch(route: Route) {
  const calls: URL[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url);
    const r = route(url);
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json', ...r.headers },
    });
  }) as typeof fetch;
  return { fn, calls };
}

describe('VikunjaClient', () => {
  it('adds /api/v1 once and sends the bearer token', async () => {
    let auth: string | null = null;
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      auth = new Headers(init?.headers).get('authorization');
      expect(String(input)).toBe('http://vk:3456/api/v1/info');
      return new Response(JSON.stringify({ version: 'v2.7.0', max_items_per_page: 50 }));
    }) as typeof fetch;
    const c = new VikunjaClient({ baseUrl: 'http://vk:3456/api/v1/', token: 'tk', fetch: fetchFn });
    expect((await c.info()).version).toBe('v2.7.0');
    expect(auth).toBe('Bearer tk');
  });

  it('paginates across 3+ pages using the total-pages header', async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.pathname.endsWith('/info')) return { body: { version: 'v2.7.0', max_items_per_page: 2 } };
      const page = Number(url.searchParams.get('page'));
      const ids = page < 3 ? [page * 10, page * 10 + 1] : [page * 10];
      return { body: ids.map((id) => task(id)), headers: { 'x-pagination-total-pages': '3' } };
    });
    const c = new VikunjaClient({ baseUrl: 'http://vk', token: 't', fetch: fn });
    await c.info();
    const tasks = await c.tasks({ filter: 'project in 1' });
    expect(tasks.map((t) => t.id)).toEqual([10, 11, 20, 21, 30]);
    const pages = calls.filter((u) => u.pathname.endsWith('/tasks'));
    expect(pages.map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3']);
    expect(pages[0]?.searchParams.get('per_page')).toBe('2');
    expect(pages[0]?.searchParams.get('filter')).toBe('project in 1');
  });

  it('falls back to a short page when the header is missing', async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.pathname.endsWith('/info')) return { body: { version: 'v2.7.0', max_items_per_page: 2 } };
      const page = Number(url.searchParams.get('page'));
      return { body: page === 1 ? [task(1), task(2)] : [task(3)] };
    });
    const c = new VikunjaClient({ baseUrl: 'http://vk', token: 't', fetch: fn });
    await c.info();
    expect((await c.tasks()).length).toBe(3);
    expect(calls.filter((u) => u.pathname.endsWith('/tasks')).length).toBe(2);
  });

  it('normalizes dates, labels, and relations', async () => {
    const { fn } = fakeFetch(() => ({
      body: [
        task(1, {
          done: true,
          done_at: '2026-03-04T05:06:07Z',
          labels: [{ id: 9, title: 'sp:5' }],
          related_tasks: { subtask: [{ id: 2, project_id: 1, title: 'child' }], parenttask: null },
        }),
      ],
      headers: { 'x-pagination-total-pages': '1' },
    }));
    const [t] = await new VikunjaClient({ baseUrl: 'http://vk', token: 't', fetch: fn }).tasks();
    expect(t?.done_at).toEqual(new Date('2026-03-04T05:06:07Z'));
    expect(t?.labels).toEqual([{ id: 9, title: 'sp:5' }]);
    expect(t?.related_tasks.subtask).toEqual([{ id: 2, project_id: 1 }]);
    expect(t?.related_tasks.parenttask).toBeNull();
  });

  it('names the failing field on schema drift', async () => {
    const { fn } = fakeFetch(() => ({
      body: [task(1), task(2, { labels: [{ id: 1, title: 42 }] })],
    }));
    const c = new VikunjaClient({ baseUrl: 'http://vk', token: 't', fetch: fn });
    const err = await c.tasks().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VikunjaSchemaError);
    expect((err as Error).message).toContain('GET /tasks');
    expect((err as Error).message).toContain('[1].labels[0].title');
  });

  it('explains a rejected token', async () => {
    const { fn } = fakeFetch(() => ({ status: 401, body: { message: 'invalid token' } }));
    const c = new VikunjaClient({ baseUrl: 'http://vk', token: 't', fetch: fn });
    const err = await c.projects().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VikunjaHttpError);
    expect((err as VikunjaHttpError).status).toBe(401);
    expect((err as Error).message).toMatch(/revoked, expired/);
  });

  it('aborts a hung request after the timeout and names the endpoint', async () => {
    let signal: AbortSignal | undefined;
    const hung = ((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    }) as typeof fetch;
    const client = new VikunjaClient({ baseUrl: 'http://vk', token: 't', fetch: hung, timeoutMs: 20 });
    await expect(client.info()).rejects.toThrow(/GET \/info: timed out after 0\.02s/);
    expect(signal).toBeDefined();
  });

  it('defaults to a 30 s timeout signal', async () => {
    let signal: AbortSignal | undefined;
    const fn = (async (_i: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response(JSON.stringify({ version: 'v2.7.0', max_items_per_page: 50 }));
    }) as typeof fetch;
    await new VikunjaClient({ baseUrl: 'http://vk', token: 't', fetch: fn }).info();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
  });

  it('wraps a non-JSON success body in an error naming the endpoint and status', async () => {
    const html = (async () => new Response('<html>Login</html>', { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;
    const client = new VikunjaClient({ baseUrl: 'http://vk', token: 't', fetch: html });
    const err = await client.info().catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/GET \/info returned HTTP 200 but the body is not valid JSON/);
    expect((err as Error).cause).toBeDefined();
  });
});
