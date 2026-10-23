// Test helper: an in-memory Vikunja served through a fake `fetch`, so the real VikunjaClient,
// Syncer and routes run end to end without a network. Not imported by production code.

import { VikunjaClient } from '../vikunja/client.js';

type World = {
  version: string;
  /** Set to make every request fail with this status (e.g. 401 for a revoked token). */
  failStatus: number | null;
  /** Resolves before /info answers; lets tests hold a sync open. */
  gate: Promise<void> | null;
  requests: string[];
};

export type FakeVikunja = {
  world: World;
  client: VikunjaClient;
  /** Number of GET /info calls, i.e. the number of syncs started. */
  syncsStarted(): number;
};

const label = (id: number, title: string) => ({ id, title });

function task(
  id: number,
  projectId: number,
  title: string,
  labels: string[],
  opts: { done?: boolean; doneAt?: string; created?: string; subtasks?: [number, number][] } = {},
) {
  return {
    id,
    identifier: `P${projectId}-${id}`,
    index: id,
    title,
    project_id: projectId,
    done: opts.done ?? false,
    done_at: opts.doneAt ?? '0001-01-01T00:00:00Z',
    created: opts.created ?? '2026-08-03T10:00:00Z',
    updated: '2026-10-01T10:00:00Z',
    labels: labels.map((t, i) => label(100 + i, t)),
    related_tasks: opts.subtasks ? { subtask: opts.subtasks.map(([tid, pid]) => ({ id: tid, project_id: pid })) } : {},
  };
}

const view = (id: number, projectId: number, doneBucket: number) => ({
  id,
  project_id: projectId,
  title: 'Kanban',
  view_kind: 'kanban',
  position: 3,
  done_bucket_id: doneBucket,
  default_bucket_id: 0,
});

const project = (id: number, title: string, parent: number, views: unknown[]) => ({
  id,
  title,
  identifier: `P${id}`,
  parent_project_id: parent,
  is_archived: false,
  position: id,
  views,
});

/**
 * Projects: 1 "Alpha" (root) with child 2 "Alpha Child", and 3 "Beta". Epic "foo" spans
 * Alpha and its child; Beta has its own "foo", which must stay a separate epic.
 */
export function buildWorld() {
  const tasks = [
    task(1, 1, 'Foo one', ['epic:foo', 'sp:3'], { done: true, doneAt: '2026-10-05T12:00:00Z' }),
    task(2, 1, 'Foo two (big)', ['epic:foo', 'sp:8']),
    task(3, 2, 'Foo in child', ['epic:foo']),
    task(4, 1, 'No epic task', ['sp:2']),
    task(5, 1, 'Bad points', ['sp:big']),
    task(6, 3, 'Beta foo', ['epic:foo', 'sp:5'], { done: true, doneAt: '2026-10-12T12:00:00Z' }),
    task(7, 3, 'Beta loose', []),
  ];
  const buckets: Record<number, { id: number; title: string; position: number; project_view_id: number; taskIds: number[] }[]> = {
    10: [
      { id: 101, title: 'Backlog', position: 1, project_view_id: 10, taskIds: [2, 4, 5] },
      { id: 102, title: 'Done', position: 2, project_view_id: 10, taskIds: [1] },
    ],
    20: [
      { id: 201, title: 'backlog', position: 1, project_view_id: 20, taskIds: [3] },
      { id: 202, title: 'Review', position: 2, project_view_id: 20, taskIds: [] },
    ],
    30: [
      { id: 301, title: 'Todo', position: 1, project_view_id: 30, taskIds: [7] },
      { id: 302, title: 'Done', position: 2, project_view_id: 30, taskIds: [6] },
    ],
  };
  const projects = [
    project(1, 'Alpha', 0, [view(10, 1, 102)]),
    project(2, 'Alpha Child', 1, [view(20, 2, 0)]),
    project(3, 'Beta', 0, [view(30, 3, 302)]),
  ];
  return { tasks, buckets, projects };
}

export function createFakeVikunja(): FakeVikunja {
  const data = buildWorld();
  const world: World = { version: 'v2.7.0', failStatus: null, gate: null, requests: [] };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'x-pagination-total-pages': '1' } });

  const fakeFetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace(/^\/api\/v1/, '');
    world.requests.push(path + url.search);
    if (path === '/info' && world.gate) await world.gate;
    if (world.failStatus) return new Response('{"message":"invalid token"}', { status: world.failStatus });
    if (path === '/info') return json({ version: world.version, max_items_per_page: 50 });
    if (path === '/projects') return json(data.projects);
    let m = /^\/projects\/(\d+)\/views$/.exec(path);
    if (m) return json(data.projects.find((p) => p.id === Number(m![1]))?.views ?? []);
    m = /^\/projects\/\d+\/views\/(\d+)\/tasks$/.exec(path);
    if (m) {
      const buckets = data.buckets[Number(m[1])] ?? [];
      const filter = url.searchParams.get('filter');
      const bucketFilter = filter ? /bucket_id = (\d+)/.exec(filter) : null;
      if (bucketFilter) {
        const b = buckets.find((x) => x.id === Number(bucketFilter[1]));
        return json((b?.taskIds ?? []).map((id) => ({ id })));
      }
      return json(
        buckets.map((b) => ({
          id: b.id,
          title: b.title,
          position: b.position,
          project_view_id: b.project_view_id,
          count: b.taskIds.length,
          tasks: b.taskIds.map((id) => ({ id })),
        })),
      );
    }
    if (path === '/tasks') {
      const ids = /project in ([\d, ]+)/.exec(url.searchParams.get('filter') ?? '')?.[1]?.split(',').map(Number);
      return json(data.tasks.filter((t) => !ids || ids.includes(t.project_id)));
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  return {
    world,
    client: new VikunjaClient({ baseUrl: 'http://vikunja.example', token: 'secret', fetch: fakeFetch }),
    syncsStarted: () => world.requests.filter((r) => r.startsWith('/info')).length,
  };
}
