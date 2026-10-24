import { describe, expect, it } from 'vitest';
import { buildModel } from './model.js';
import { compareRollups, epicTasks, noEpicTasks, rollup } from './rollup.js';
import { snapshotRows } from './snapshot.js';
import { cfg, project, task, vtask } from './testing.js';

describe('rollup', () => {
  it('handles an empty epic', () => {
    expect(rollup([])).toEqual({
      pointsTotal: 0,
      pointsDone: 0,
      tasksTotal: 0,
      tasksDone: 0,
      unpointedOpen: 0,
      status: 'not-started',
      lastCompletedAt: null,
      firstCreatedAt: null,
      lastUpdatedAt: null,
      buckets: [],
    });
  });

  it('keeps unpointed work out of points and counts open unpointed as debt', () => {
    const r = rollup([task(1), task(2, { done: true, doneAt: new Date('2026-02-01T00:00:00Z') }), task(3)]);
    expect(r.pointsTotal).toBe(0);
    expect(r.tasksTotal).toBe(3);
    expect(r.tasksDone).toBe(1);
    expect(r.unpointedOpen).toBe(2);
    expect(r.status).toBe('in-progress');
  });

  it('sums points, done points and last completion', () => {
    const r = rollup([
      task(1, { points: 3, done: true, doneAt: new Date('2026-02-01T00:00:00Z') }),
      task(2, { points: 5, done: true, doneAt: new Date('2026-03-01T00:00:00Z') }),
      task(3, { points: 8 }),
    ]);
    expect(r).toMatchObject({ pointsTotal: 16, pointsDone: 8, tasksTotal: 3, tasksDone: 2, unpointedOpen: 0 });
    expect(r.lastCompletedAt).toEqual(new Date('2026-03-01T00:00:00Z'));
  });

  it('tracks the earliest creation and the latest update across members', () => {
    const at = (s: string): Date => new Date(s);
    const r = rollup([
      task(1, { createdAt: at('2026-02-01T00:00:00Z'), updatedAt: at('2026-04-01T00:00:00Z') }),
      task(2, { createdAt: at('2026-01-15T00:00:00Z'), updatedAt: at('2026-05-01T00:00:00Z') }),
    ]);
    expect(r.firstCreatedAt).toEqual(at('2026-01-15T00:00:00Z'));
    expect(r.lastUpdatedAt).toEqual(at('2026-05-01T00:00:00Z'));
  });

  it('reports done only when every task is done', () => {
    const d = { done: true, doneAt: new Date('2026-02-01T00:00:00Z') };
    expect(rollup([task(1, d), task(2, d)]).status).toBe('done');
    expect(rollup([task(1, d), task(2)]).status).toBe('in-progress');
    expect(rollup([task(1), task(2)]).status).toBe('not-started');
  });

  it('counts a reopened task as open', () => {
    const [reopened] = buildModel(
      [{ project: project(1), tasks: [{ ...vtask(1, { done: false }), done_at: new Date('2026-01-05T00:00:00Z') }], board: null }],
      [project(1)],
      cfg,
    ).tasks;
    expect(reopened!.doneAt).toBeNull();
    const r = rollup([reopened!]);
    expect(r.tasksDone).toBe(0);
    expect(r.lastCompletedAt).toBeNull();
    expect(r.status).toBe('not-started');
  });

  it('breaks counts down per bucket, including unbucketed, omitting empty buckets', () => {
    const r = rollup([
      task(1, { bucketKey: 'todo', points: 2 }),
      task(2, { bucketKey: 'todo' }),
      task(3, { bucketKey: 'done', points: 3, done: true, doneAt: new Date() }),
      task(4),
    ]);
    const by = Object.fromEntries(r.buckets.map((b) => [String(b.bucketKey), b]));
    expect(Object.keys(by).sort()).toEqual(['done', 'null', 'todo']);
    expect(by.todo).toEqual({ bucketKey: 'todo', tasks: 2, points: 2, unpointed: 1 });
    expect(by.done).toEqual({ bucketKey: 'done', tasks: 1, points: 3, unpointed: 0 });
    expect(by.null).toEqual({ bucketKey: null, tasks: 1, points: 0, unpointed: 1 });
  });
});

describe('compareRollups', () => {
  it('orders by status, then points remaining descending', () => {
    const mk = (status: 'done' | 'in-progress' | 'not-started', pointsTotal: number, pointsDone: number) => ({
      status,
      pointsTotal,
      pointsDone,
    });
    const list = [mk('done', 5, 5), mk('not-started', 8, 0), mk('in-progress', 10, 8), mk('in-progress', 20, 5)];
    list.sort(compareRollups);
    expect(list.map((r) => [r.status, r.pointsTotal])).toEqual([
      ['in-progress', 20],
      ['in-progress', 10],
      ['not-started', 8],
      ['done', 5],
    ]);
  });
});

describe('epicTasks / noEpicTasks / snapshotRows', () => {
  const data = [
    {
      project: project(1),
      tasks: [
        vtask(1, { labels: ['epic', 'epic:alpha'], subtasks: [2] }),
        vtask(2, { labels: ['sp:3'] }),
        vtask(3, { labels: ['epic:beta', 'sp:2'], done: true }),
        vtask(4),
      ],
      board: null,
    },
    { project: project(9), tasks: [vtask(5, { project: 9 })], board: null },
  ];
  const model = buildModel(data, [project(1), project(9)], cfg);

  it('excludes marker tasks from members and from the No-epic bucket', () => {
    expect(epicTasks(model, '1:alpha').map((t) => t.id)).toEqual([2]);
    expect(epicTasks(model, '1:beta').map((t) => t.id)).toEqual([3]);
    expect(noEpicTasks(model, 1).map((t) => t.id)).toEqual([4]);
    expect(noEpicTasks(model, 9).map((t) => t.id)).toEqual([5]);
  });

  it('writes one row per epic plus a No-epic row per root', () => {
    const rows = snapshotRows(model, '2026-02-01');
    expect(rows.map((r) => [r.projectId, r.epicSlug])).toEqual([
      [1, 'alpha'],
      [1, 'beta'],
      [1, ''],
      [9, ''],
    ]);
    expect(rows[0]).toEqual({
      date: '2026-02-01',
      projectId: 1,
      epicSlug: 'alpha',
      pointsTotal: 3,
      pointsDone: 0,
      tasksTotal: 1,
      tasksDone: 0,
      unpointedOpen: 0,
    });
    expect(rows[2]).toMatchObject({ tasksTotal: 1, unpointedOpen: 1 });
    expect(snapshotRows(model, '2026-02-01')).toEqual(rows);
  });
});
