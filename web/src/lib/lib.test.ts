import { describe, expect, it } from 'vitest';
import type { BucketDTO, ProjectDTO, TaskDTO } from '../../../shared/api';
import { buildBurnupSeries } from './burnup';
import { forecastText, percent, relativeTime, sparklinePoints } from './format';
import { buildPickerRows, selectionLabel } from './projects';
import { parseProjectIds, projectsQueryString, toggleId } from './query';
import { computeSegments, segmentDescription } from './segments';
import { filterTasks, NO_BUCKET_FILTER } from './tasks';

const buckets: BucketDTO[] = [
  { key: 'todo', name: 'To do', position: 0, color: '#111111', isDone: false },
  { key: 'doing', name: 'Doing', position: 1, color: '#222222', isDone: false },
  { key: 'done', name: 'Done', position: 2, color: '#333333', isDone: true },
];

describe('computeSegments', () => {
  const rollup = {
    buckets: [
      { bucketKey: 'done', tasks: 2, points: 8, unpointed: 0 },
      { bucketKey: null, tasks: 1, points: 0, unpointed: 1 },
      { bucketKey: 'todo', tasks: 5, points: 5, unpointed: 3 },
      { bucketKey: 'doing', tasks: 0, points: 0, unpointed: 0 },
    ],
  };

  it('orders by bucket position, unbucketed last, and skips empty buckets', () => {
    const bar = computeSegments(rollup, buckets, 'tasks');
    expect(bar.segments.map((s) => s.bucketKey)).toEqual(['todo', 'done', null]);
    expect(bar.segments.map((s) => s.widthPct)).toEqual([62.5, 25, 12.5]);
    expect(bar.segments[2]?.name).toBe('Not on board');
    expect(bar.empty).toBe(false);
  });

  it('computes the share of the epic and the cumulative centre', () => {
    const bar = computeSegments(rollup, buckets, 'tasks');
    expect(bar.segments[0]?.pctOfEpic).toBe(62.5);
    expect(bar.segments[0]?.centerPct).toBe(31.25);
  });

  it('points mode: unpointed tickets add no width but segments keep their counts', () => {
    const bar = computeSegments(rollup, buckets, 'points');
    expect(bar.segments.map((s) => s.bucketKey)).toEqual(['todo', 'done']);
    expect(bar.segments[0]?.widthPct).toBeCloseTo((5 / 13) * 100);
    expect(bar.segments[0]?.unpointed).toBe(3);
    expect(bar.segments[0]?.pctOfEpic).toBe(62.5);
  });

  it('points mode with no pointed tickets is empty and labelled unpointed', () => {
    const bar = computeSegments(
      { buckets: [{ bucketKey: 'todo', tasks: 3, points: 0, unpointed: 3 }] },
      buckets,
      'points',
    );
    expect(bar).toEqual({ segments: [], empty: true, emptyLabel: 'unpointed' });
  });

  it('an epic with no tasks is empty in both modes', () => {
    expect(computeSegments({ buckets: [] }, buckets, 'tasks').emptyLabel).toBe('no tasks');
    expect(computeSegments({ buckets: [] }, buckets, 'points').empty).toBe(true);
  });

  it('falls back to grey and the key for buckets missing from the legend', () => {
    const bar = computeSegments({ buckets: [{ bucketKey: 'ghost', tasks: 1, points: 1, unpointed: 0 }] }, buckets, 'tasks');
    expect(bar.segments[0]?.name).toBe('ghost');
    expect(bar.segments[0]?.color).toBe('#4b5563');
  });

  it('describes a segment in words', () => {
    const s = computeSegments(rollup, buckets, 'tasks').segments[0]!;
    expect(segmentDescription(s)).toBe('To do: 5 tickets (63% of epic), 5 pts, 3 unpointed');
  });
});

describe('project query parsing', () => {
  it('parses, dedupes and drops junk', () => {
    expect(parseProjectIds('12,15')).toEqual([12, 15]);
    expect(parseProjectIds('12, 12,x,-3,1.5,7')).toEqual([12, 7]);
    expect(parseProjectIds(['4'])).toEqual([4]);
  });
  it('returns null when missing or unusable', () => {
    expect(parseProjectIds(undefined)).toBeNull();
    expect(parseProjectIds('')).toBeNull();
    expect(parseProjectIds('abc')).toBeNull();
  });
  it('builds the API query string', () => {
    expect(projectsQueryString([12, 15])).toBe('?projects=12,15');
    expect(projectsQueryString(null)).toBe('');
  });
  it('toggles ids in sorted order', () => {
    expect(toggleId([3, 9], 5)).toEqual([3, 5, 9]);
    expect(toggleId([3, 5, 9], 5)).toEqual([3, 9]);
  });
});

describe('project picker rows', () => {
  const p = (id: number, title: string, parentId: number | null): ProjectDTO => ({
    id,
    title,
    parentId,
    rootId: parentId ?? id,
    epicCount: 0,
    taskCount: 0,
  });
  const projects = [p(1, 'Alpha', null), p(2, 'Alpha Web', 1), p(3, 'Beta', null), p(4, 'Beta Docs', 3), p(5, 'Orphan', 99)];

  it('nests children under parents', () => {
    expect(buildPickerRows(projects).map((r) => [r.project.id, r.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 0],
      [4, 1],
      [5, 0],
    ]);
  });
  it('filters by title and keeps ancestors of matches', () => {
    expect(buildPickerRows(projects, 'docs').map((r) => r.project.id)).toEqual([3, 4]);
    expect(buildPickerRows(projects, 'zzz')).toEqual([]);
  });
  it('labels the selection', () => {
    expect(selectionLabel(projects, [1])).toBe('Alpha');
    expect(selectionLabel(projects, [1, 3, 4])).toBe('Alpha, Beta +1');
    expect(selectionLabel(projects, [])).toBe('No projects');
  });
});

describe('filterTasks', () => {
  const t = (id: number, bucketKey: string | null, points: number | null, done: boolean): TaskDTO => ({
    id,
    ref: `T-${id}`,
    title: `Task ${id}`,
    url: 'https://vikunja.example/tasks/' + id,
    projectId: 1,
    bucketKey,
    points,
    done,
    doneAt: null,
    flags: [],
  });
  const tasks = [t(1, 'todo', 3, false), t(2, 'done', 5, true), t(3, null, null, false), t(4, 'todo', null, false)];
  it('filters by bucket, state and pointed', () => {
    expect(filterTasks(tasks, { bucket: 'todo', state: 'all', pointed: 'all' }).map((x) => x.id)).toEqual([1, 4]);
    expect(filterTasks(tasks, { bucket: NO_BUCKET_FILTER, state: 'all', pointed: 'all' }).map((x) => x.id)).toEqual([3]);
    expect(filterTasks(tasks, { bucket: '', state: 'done', pointed: 'all' }).map((x) => x.id)).toEqual([2]);
    expect(filterTasks(tasks, { bucket: '', state: 'open', pointed: 'unpointed' }).map((x) => x.id)).toEqual([3, 4]);
    expect(filterTasks(tasks, { bucket: '', state: 'all', pointed: 'all' })).toHaveLength(4);
  });
});

describe('burn-up series', () => {
  const pt = (date: string, source: 'reconstructed' | 'snapshot', n: number) => ({
    date,
    source,
    scopePoints: n * 10,
    donePoints: n * 4,
    scopeTasks: n,
    doneTasks: n - 1,
  });
  const points = [pt('2026-03-08', 'snapshot', 3), pt('2026-03-01', 'reconstructed', 1), pt('2026-03-02', 'reconstructed', 2)];
  it('sorts by date, picks the metric, and finds the reconstructed range', () => {
    const s = buildBurnupSeries(points, 'points');
    expect(s.dates).toEqual(['2026-03-01', '2026-03-02', '2026-03-08']);
    expect(s.scope).toEqual([10, 20, 30]);
    expect(s.done).toEqual([4, 8, 12]);
    expect(s.reconstructed).toEqual(['2026-03-01', '2026-03-02']);
    expect(buildBurnupSeries(points, 'tasks').scope).toEqual([1, 2, 3]);
  });
  it('has no reconstructed range for snapshot-only history', () => {
    expect(buildBurnupSeries([pt('2026-03-08', 'snapshot', 3)], 'tasks').reconstructed).toBeNull();
  });
});

describe('format helpers', () => {
  it('percent clamps and handles zero totals', () => {
    expect(percent(1, 4)).toBe(25);
    expect(percent(5, 0)).toBe(0);
    expect(percent(9, 3)).toBe(100);
  });
  it('relativeTime', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    expect(relativeTime(null, now)).toBe('never');
    expect(relativeTime('2026-06-01T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-06-01T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-06-01T07:00:00Z', now)).toBe('5 h ago');
    expect(relativeTime('2026-05-25T12:00:00Z', now)).toBe('7 d ago');
  });
  it('forecastText', () => {
    expect(forecastText(null)).toBeNull();
    expect(forecastText({ weeksLow: 3, weeksHigh: 5 })).toBe('Forecast: 3 to 5 weeks to finish');
    expect(forecastText({ weeksLow: 1, weeksHigh: 1 })).toBe('Forecast: about 1 week to finish');
  });
  it('sparklinePoints scales to the box', () => {
    expect(sparklinePoints([], 10, 10)).toBe('');
    expect(sparklinePoints([0, 10], 12, 12, 2)).toBe('2.0,10.0 10.0,2.0');
  });
});
