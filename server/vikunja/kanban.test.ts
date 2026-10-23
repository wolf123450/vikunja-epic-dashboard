import { describe, expect, it } from 'vitest';
import { VikunjaClient } from './client.js';
import { fetchBoard, pickKanbanView } from './kanban.js';
import type { VikunjaView } from './schemas.js';

const view = (id: number, kind: VikunjaView['view_kind'], position: number, done = 0): VikunjaView => ({
  id,
  project_id: 1,
  title: kind,
  view_kind: kind,
  position,
  done_bucket_id: done,
  default_bucket_id: 0,
});

describe('pickKanbanView', () => {
  const views = [view(1, 'list', 1), view(5, 'kanban', 30), view(4, 'kanban', 20)];

  it('picks the first Kanban view by position', () => {
    expect(pickKanbanView(views)?.id).toBe(4);
  });
  it('honours a configured view', () => {
    expect(pickKanbanView(views, 5)?.id).toBe(5);
  });
  it('rejects a configured view that is not Kanban', () => {
    expect(() => pickKanbanView(views, 1)).toThrow(/KANBAN_VIEW_ID 1/);
  });
  it('returns null without a Kanban view', () => {
    expect(pickKanbanView([view(1, 'list', 1)])).toBeNull();
  });
});

describe('fetchBoard', () => {
  it('uses nested tasks when complete and pages in larger buckets', async () => {
    const requests: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      requests.push(url.search);
      const filter = url.searchParams.get('filter');
      if (!filter) {
        return Response.json([
          { id: 30, title: 'Done', position: 300, project_view_id: 4, count: 1, tasks: [{ id: 9 }] },
          { id: 10, title: 'Backlog', position: 100, project_view_id: 4, count: 3, tasks: [{ id: 1 }, { id: 2 }] },
          { id: 20, title: 'Doing', position: 200, project_view_id: 4, count: 0, tasks: null },
        ]);
      }
      expect(filter).toBe('bucket_id = 10');
      const page = Number(url.searchParams.get('page'));
      return Response.json(page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }], {
        headers: { 'x-pagination-total-pages': '2' },
      });
    }) as typeof fetch;

    const client = new VikunjaClient({ baseUrl: 'http://vk', token: 't', fetch: fetchFn });
    const board = await fetchBoard(client, 1, [view(4, 'kanban', 1, 30)]);

    expect(board?.buckets.map((b) => b.name)).toEqual(['Backlog', 'Doing', 'Done']);
    expect(board?.doneBucketId).toBe(30);
    expect([...board!.taskBucket]).toEqual([
      [9, 30],
      [1, 10],
      [2, 10],
      [3, 10],
    ]);
    // One listing call plus two pages for the oversized bucket; none for complete or empty ones.
    expect(requests.length).toBe(3);
  });
});
