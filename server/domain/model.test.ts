import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectSchema, taskSchema } from '../vikunja/schemas.js';
import { buildModel } from './model.js';
import { epicTasks, noEpicTasks, rollup } from './rollup.js';
import { board, cfg, project, vtask } from './testing.js';
import type { DomainConfig, ProjectData } from './types.js';

const pd = (id: number, tasks: ProjectData['tasks'], b: ProjectData['board'] = null, parent = 0): ProjectData => ({
  project: project(id, parent),
  tasks,
  board: b,
});
const flagTypes = (m: ReturnType<typeof buildModel>, id: number) => m.tasks.find((t) => t.id === id)!.flags.map((f) => f.type);
const ids = (ts: { id: number }[]) => ts.map((t) => t.id).sort((a, b) => a - b);

describe('buildModel: basics', () => {
  it('normalizes ref, url, points and dates', () => {
    const m = buildModel([pd(1, [vtask(7, { labels: ['SP: 3'], done: true, doneAt: '2026-02-02T00:00:00Z' }), vtask(8)])], [project(1)], cfg);
    const [a, b] = m.tasks;
    expect(a).toMatchObject({ id: 7, ref: 'P1-7', points: 3, done: true, url: 'https://vk.example.test/tasks/7', projectId: 1, rootProjectId: 1 });
    expect(a!.doneAt).toEqual(new Date('2026-02-02T00:00:00Z'));
    expect(b!.doneAt).toBeNull();
    expect(flagTypes(m, 8)).toEqual(['no-epic', 'unpointed-open']);
  });

  it('falls back to #index when there is no identifier', () => {
    const t = { ...vtask(7), identifier: '', index: 12 };
    expect(buildModel([pd(1, [t])], [project(1)], cfg).tasks[0]!.ref).toBe('#12');
  });

  it('carries points flags onto tasks', () => {
    const m = buildModel([pd(1, [vtask(1, { labels: ['sp:8', 'sp:x'] })])], [project(1)], cfg);
    expect(flagTypes(m, 1)).toEqual(['invalid-points', 'oversized', 'no-epic']);
  });
});

describe('buildModel: roots', () => {
  const projects = [project(1), project(2, 1), project(3, 2), project(10)];

  it('rolls descendants up to the top-most ancestor', () => {
    const m = buildModel([pd(1, []), pd(2, [], null, 1), pd(3, [vtask(1, { project: 3 })], null, 2), pd(10, [])], projects, cfg);
    expect(m.rootOf.get(3)).toBe(1);
    expect(m.rootOf.get(2)).toBe(1);
    expect(m.rootOf.get(10)).toBe(10);
    expect(m.tasks[0]!.rootProjectId).toBe(1);
  });

  it('does not climb through ancestors that are not selected', () => {
    // 3 -> 2 -> 1, but only 3 and 2 are fetched: 2 is the top-most selected ancestor.
    const m = buildModel([pd(2, [], null, 1), pd(3, [vtask(1, { project: 3 })], null, 2)], projects, cfg);
    expect(m.rootOf.get(3)).toBe(2);
    expect(m.rootOf.has(1)).toBe(false);
    expect(m.tasks[0]!.rootProjectId).toBe(2);
    const lone = buildModel([pd(3, [vtask(1, { project: 3 })], null, 2)], projects, cfg);
    expect(lone.rootOf.get(3)).toBe(3);
    expect(lone.tasks[0]!.rootProjectId).toBe(3);
  });

  it('keeps projects as their own root when child projects are not included', () => {
    const m = buildModel([pd(2, [vtask(1, { project: 2 })])], projects, { ...cfg, includeChildProjects: false });
    expect(m.tasks[0]!.rootProjectId).toBe(2);
  });
});

describe('buildModel: label epics', () => {
  it('puts a task in every epic label it carries and flags overlap only when disallowed', () => {
    const data = [pd(1, [vtask(1, { labels: ['epic:a', 'Epic: B'] }), vtask(2, { labels: ['epic:a'] })])];
    const m = buildModel(data, [project(1)], cfg);
    expect(m.epics.map((e) => [e.key, e.name, e.source]).sort()).toEqual([
      ['1:a', 'A', 'label'],
      ['1:b', 'B', 'label'],
    ]);
    expect(ids(epicTasks(m, '1:a'))).toEqual([1, 2]);
    expect(ids(epicTasks(m, '1:b'))).toEqual([1]);
    expect(flagTypes(m, 1)).not.toContain('epic-overlap');

    const strict = buildModel(data, [project(1)], { ...cfg, epicAllowOverlap: false });
    expect(flagTypes(strict, 1)).toContain('epic-overlap');
    expect(flagTypes(strict, 2)).not.toContain('epic-overlap');
  });

  it('merges the same slug across a parent and child project, keeps unrelated roots apart', () => {
    const projects = [project(1), project(2, 1), project(5)];
    const m = buildModel(
      [
        pd(1, [vtask(1, { labels: ['epic:shared'] })]),
        pd(2, [vtask(2, { project: 2, labels: ['epic:shared'] })], null, 1),
        pd(5, [vtask(3, { project: 5, labels: ['epic:shared'] })]),
      ],
      projects,
      cfg,
    );
    expect(m.epics.map((e) => e.key).sort()).toEqual(['1:shared', '5:shared']);
    expect(ids(epicTasks(m, '1:shared'))).toEqual([1, 2]);
    expect(ids(epicTasks(m, '5:shared'))).toEqual([3]);
  });

  it('ignores marker labels in label mode', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { labels: ['epic'], subtasks: [2] }), vtask(2)])],
      [project(1)],
      { ...cfg, epicMode: 'label' },
    );
    expect(m.epics).toEqual([]);
    expect(m.tasks[0]!.isEpicParent).toBe(false);
    expect(ids(noEpicTasks(m, 1))).toEqual([1, 2]);
  });
});

describe('buildModel: parent epics', () => {
  const parentCfg: DomainConfig = { ...cfg, epicMode: 'parent' };

  it('collects nested subtasks recursively, using the title for the slug', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { title: 'Inventory System', labels: ['epic'], subtasks: [2, 3] }), vtask(2, { subtasks: [4] }), vtask(3), vtask(4), vtask(5)])],
      [project(1)],
      parentCfg,
    );
    expect(m.epics).toEqual([
      { key: '1:inventory-system', slug: 'inventory-system', name: 'Inventory System', source: 'parent', rootProjectId: 1, parentTaskId: 1 },
    ]);
    expect(ids(epicTasks(m, '1:inventory-system'))).toEqual([2, 3, 4]);
    expect(ids(noEpicTasks(m, 1))).toEqual([5]);
    expect(flagTypes(m, 1)).not.toContain('no-epic');
    expect(flagTypes(m, 5)).toContain('no-epic');
  });

  it('prefers the marker task\'s own epic: label for the slug, and ignores epic: labels on members', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { title: 'Whatever', labels: ['epic', 'epic:inv'], subtasks: [2] }), vtask(2), vtask(3, { labels: ['epic:inv'] })])],
      [project(1)],
      parentCfg,
    );
    expect(m.epics.map((e) => e.key)).toEqual(['1:inv']);
    expect(ids(epicTasks(m, '1:inv'))).toEqual([2]);
  });

  it('adds the marker task to its own epic only with epicParentPoints', () => {
    const data = [pd(1, [vtask(1, { title: 'E', labels: ['epic', 'sp:13'], subtasks: [2] }), vtask(2)])];
    expect(ids(epicTasks(buildModel(data, [project(1)], parentCfg), '1:e'))).toEqual([2]);
    const withPts = buildModel(data, [project(1)], { ...parentCfg, epicParentPoints: true });
    expect(ids(epicTasks(withPts, '1:e'))).toEqual([1, 2]);
    expect(rollup(epicTasks(withPts, '1:e')).pointsTotal).toBe(13);
  });

  it('lets nested epics share leaf tasks without making markers members', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { title: 'Outer', labels: ['epic'], subtasks: [2] }), vtask(2, { title: 'Inner', labels: ['epic'], subtasks: [3] }), vtask(3)])],
      [project(1)],
      parentCfg,
    );
    expect(ids(epicTasks(m, '1:outer'))).toEqual([3]);
    expect(ids(epicTasks(m, '1:inner'))).toEqual([3]);
    expect(m.tasks.find((t) => t.id === 3)!.epicKeys.sort()).toEqual(['1:inner', '1:outer']);
  });

  it('detects subtask cycles, stops, and flags the task that closes the cycle', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { title: 'Cyc', labels: ['epic'], subtasks: [2] }), vtask(2, { subtasks: [3] }), vtask(3, { subtasks: [2] })])],
      [project(1)],
      parentCfg,
    );
    expect(ids(epicTasks(m, '1:cyc'))).toEqual([2, 3]);
    expect(flagTypes(m, 3)).toContain('subtask-cycle');
    expect(flagTypes(m, 2)).not.toContain('subtask-cycle');
  });

  it('flags a cycle that returns to the marker itself', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { title: 'Cyc', labels: ['epic'], subtasks: [2] }), vtask(2, { subtasks: [1] })])],
      [project(1)],
      parentCfg,
    );
    expect(flagTypes(m, 2)).toContain('subtask-cycle');
    expect(ids(epicTasks(m, '1:cyc'))).toEqual([2]);
  });
});

describe('buildModel: both mode', () => {
  it('merges label members into a parent epic with the same slug', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { title: 'Inventory System', labels: ['epic', 'epic:inv'], subtasks: [2] }), vtask(2), vtask(3, { labels: ['epic:inv'] }), vtask(4, { labels: ['epic:other'] })])],
      [project(1)],
      cfg,
    );
    const inv = m.epics.find((e) => e.slug === 'inv')!;
    expect(inv).toMatchObject({ source: 'parent', parentTaskId: 1 });
    expect(ids(epicTasks(m, '1:inv'))).toEqual([2, 3]);
    expect(m.epics.find((e) => e.slug === 'other')!.source).toBe('label');
  });

  it('merges by title slug too', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { title: 'Inventory System', labels: ['epic'], subtasks: [2] }), vtask(2), vtask(3, { labels: ['epic:inventory-system'] })])],
      [project(1)],
      cfg,
    );
    expect(m.epics).toHaveLength(1);
    expect(ids(epicTasks(m, '1:inventory-system'))).toEqual([2, 3]);
  });

  it('flags a task in two epics via parent and label when overlap is disallowed', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { title: 'A', labels: ['epic'], subtasks: [2] }), vtask(2, { labels: ['epic:b'] })])],
      [project(1)],
      { ...cfg, epicAllowOverlap: false },
    );
    expect(flagTypes(m, 2)).toContain('epic-overlap');
  });
});

describe('buildModel: buckets', () => {
  const projects = [project(1), project(2, 1), project(3, 1)];

  it('matches child buckets by name, appends unmatched ones, and records them', () => {
    const rootBoard = board(1, [[10, 'Backlog'], [11, 'Doing'], [12, 'Done']], [[1, 11]], 12);
    const childBoard = board(2, [[20, ' backlog '], [21, 'Review'], [22, 'DONE']], [[2, 21], [3, 22]], 22);
    const m = buildModel(
      [
        pd(1, [vtask(1)], rootBoard),
        pd(2, [vtask(2, { project: 2 }), vtask(3, { project: 2, done: true })], childBoard, 1),
      ],
      projects,
      cfg,
    );
    expect(m.buckets.get(1)).toEqual([
      { key: 'backlog', name: 'Backlog', position: 0, isDone: false },
      { key: 'doing', name: 'Doing', position: 1, isDone: false },
      { key: 'done', name: 'Done', position: 2, isDone: true },
      { key: 'review', name: 'Review', position: 3, isDone: false },
    ]);
    expect(m.unmatchedBuckets).toEqual([{ rootProjectId: 1, projectId: 2, bucketName: 'Review' }]);
    expect(m.tasks.map((t) => t.bucketKey)).toEqual(['doing', 'review', 'done']);
  });

  it('marks a bucket done when a child board only has it as done bucket', () => {
    const rootBoard = board(1, [[10, 'Todo'], [11, 'Finished']], [], 0);
    const childBoard = board(2, [[20, 'finished']], [], 20);
    const m = buildModel([pd(1, [], rootBoard), pd(2, [], childBoard, 1)], projects, cfg);
    expect(m.buckets.get(1)!.find((b) => b.key === 'finished')!.isDone).toBe(true);
    expect(m.unmatchedBuckets).toEqual([]);
  });

  it('uses the first child board as the buckets when the root has none, without flagging', () => {
    const m = buildModel(
      [pd(1, []), pd(2, [], board(2, [[20, 'A'], [21, 'B']]), 1), pd(3, [], board(3, [[30, 'b'], [31, 'C']]), 1)],
      projects,
      cfg,
    );
    expect(m.buckets.get(1)!.map((b) => [b.key, b.position])).toEqual([['a', 0], ['b', 1], ['c', 2]]);
    expect(m.unmatchedBuckets).toEqual([]);
  });

  it('gives tasks off the board a null bucket', () => {
    const m = buildModel([pd(1, [vtask(1)], board(1, [[10, 'Todo']]))], [project(1)], cfg);
    expect(m.tasks[0]!.bucketKey).toBeNull();
  });
});

describe('buildModel: done/bucket mismatch', () => {
  const b = board(1, [[10, 'Todo'], [11, 'Done']], [[1, 11], [2, 10], [3, 11], [4, 10]], 11);

  it('flags done tasks outside the done bucket and open tasks inside it', () => {
    const m = buildModel(
      [pd(1, [vtask(1, { done: false }), vtask(2, { done: true }), vtask(3, { done: true }), vtask(4)], b)],
      [project(1)],
      cfg,
    );
    expect(flagTypes(m, 1)).toContain('done-bucket-mismatch');
    expect(flagTypes(m, 2)).toContain('done-bucket-mismatch');
    expect(flagTypes(m, 3)).not.toContain('done-bucket-mismatch');
    expect(flagTypes(m, 4)).not.toContain('done-bucket-mismatch');
  });

  it('never flags when the view has no done bucket', () => {
    const m = buildModel([pd(1, [vtask(2, { done: true })], { ...b, doneBucketId: 0 })], [project(1)], cfg);
    expect(flagTypes(m, 2)).not.toContain('done-bucket-mismatch');
  });

  it('never flags tasks absent from the board', () => {
    const m = buildModel([pd(1, [vtask(9, { done: true })], b)], [project(1)], cfg);
    expect(flagTypes(m, 9)).not.toContain('done-bucket-mismatch');
  });
});

describe('buildModel: fixtures smoke test', () => {
  it('builds a model from recorded fixtures', () => {
    const rawTasks = [...JSON.parse(readFileSync('fixtures/tasks-page1.json', 'utf8')), ...JSON.parse(readFileSync('fixtures/tasks-page2.json', 'utf8'))] as unknown[];
    const tasks = rawTasks.map((t) => taskSchema.parse(t));
    const projects = (JSON.parse(readFileSync('fixtures/projects.json', 'utf8')) as unknown[])
      .map((p) => projectSchema.parse(p))
      .filter((p) => p.id > 0);
    const byProject = new Map<number, typeof tasks>();
    for (const t of tasks) byProject.set(t.project_id, [...(byProject.get(t.project_id) ?? []), t]);
    const data: ProjectData[] = [...byProject].map(([id, ts]) => ({
      project: projects.find((p) => p.id === id) ?? project(id),
      tasks: ts,
      board: null,
    }));

    const m = buildModel(data, projects, cfg);
    expect(m.tasks).toHaveLength(tasks.length);
    expect(m.tasks.some((t) => t.points !== null)).toBe(true);
    const placed = new Set([
      ...m.epics.flatMap((e) => epicTasks(m, e.key).map((t) => t.id)),
      ...[...new Set(m.rootOf.values())].flatMap((r) => noEpicTasks(m, r).map((t) => t.id)),
    ]);
    for (const t of m.tasks.filter((x) => !x.isEpicParent)) expect(placed.has(t.id)).toBe(true);
  });
});
