// Clearly fake mock data for `VITE_MOCK=1`, built from the shared API types. Deterministic.
import type {
  BucketCountDTO,
  BucketDTO,
  BurnupPointDTO,
  EpicDTO,
  EpicStatus,
  FlagDTO,
  HygieneGroupDTO,
  HygieneResponse,
  ProjectDTO,
  RollupDTO,
  TaskDTO,
  WeekDTO,
} from '../../../shared/api';
import { bucketColor } from '../../../shared/palette';

const BASE_URL = 'https://tasks.example.invalid';

export const mockProjects: ProjectDTO[] = [
  { id: 1, title: 'Sample Platform', parentId: null, rootId: 1, epicCount: 6, taskCount: 70 },
  { id: 2, title: 'Sample Mobile App', parentId: 1, rootId: 1, epicCount: 0, taskCount: 18 },
  { id: 3, title: 'Demo Infrastructure', parentId: null, rootId: 3, epicCount: 2, taskCount: 24 },
  { id: 4, title: 'Example Docs', parentId: null, rootId: 4, epicCount: 1, taskCount: 9 },
];

export const MOCK_DEFAULT_SELECTION = [1, 3];

const bucketDefs: { key: string; name: string; isDone: boolean }[] = [
  { key: 'backlog', name: 'Backlog', isDone: false },
  { key: 'to-do', name: 'To do', isDone: false },
  { key: 'in-progress', name: 'In progress', isDone: false },
  { key: 'in-review', name: 'In review', isDone: false },
  { key: 'testing', name: 'Testing', isDone: false },
  { key: 'blocked', name: 'Blocked', isDone: false },
  { key: 'done', name: 'Done', isDone: true },
];

export const mockBuckets: BucketDTO[] = bucketDefs.map((b, position) => ({
  ...b,
  position,
  color: bucketColor({ ...b, position }),
}));

type EpicSpec = {
  slug: string;
  name: string;
  root: number;
  source: 'label' | 'parent';
  /** Tickets per bucket key, in bucketDefs order, then "none" (not on board). */
  counts: Record<string, number>;
  /** How many tickets are left unpointed (open ones first). */
  unpointed: number;
};

const specs: EpicSpec[] = [
  { slug: 'widget-engine', name: 'Widget Engine Rewrite', root: 1, source: 'label', counts: { backlog: 4, 'to-do': 3, 'in-progress': 3, 'in-review': 2, testing: 1, done: 6 }, unpointed: 2 },
  { slug: 'sample-onboarding', name: 'Sample Onboarding Flow', root: 1, source: 'parent', counts: { backlog: 2, 'to-do': 2, 'in-progress': 2, blocked: 1, done: 9 }, unpointed: 1 },
  { slug: 'demo-reporting', name: 'Demo Reporting Suite', root: 1, source: 'label', counts: { backlog: 7, 'to-do': 2, 'in-progress': 1, done: 2, none: 1 }, unpointed: 4 },
  { slug: 'example-search', name: 'Example Search Overhaul', root: 1, source: 'label', counts: { backlog: 6, 'to-do': 3 }, unpointed: 9 },
  { slug: 'placeholder-billing', name: 'Placeholder Billing Revamp', root: 1, source: 'label', counts: { backlog: 5, 'to-do': 4 }, unpointed: 0 },
  { slug: 'fake-auth', name: 'Fake Auth Hardening', root: 1, source: 'parent', counts: { 'in-review': 1, testing: 1, done: 10 }, unpointed: 0 },
  { slug: 'cluster-upgrade', name: 'Cluster Upgrade', root: 3, source: 'label', counts: { backlog: 1, 'to-do': 2, 'in-progress': 2, blocked: 2, done: 5 }, unpointed: 1 },
  { slug: 'backup-drills', name: 'Backup Drills', root: 3, source: 'label', counts: { done: 7 }, unpointed: 0 },
  { slug: 'style-guide', name: 'Style Guide Cleanup', root: 4, source: 'label', counts: { backlog: 3, 'to-do': 1, done: 4 }, unpointed: 0 },
  { slug: '', name: 'No epic', root: 1, source: 'label', counts: { backlog: 5, 'to-do': 3, 'in-progress': 1, done: 2, none: 2 }, unpointed: 9 },
  { slug: '', name: 'No epic', root: 3, source: 'label', counts: { backlog: 2, done: 1 }, unpointed: 2 },
];

const SCALE = [1, 2, 3, 5, 8, 13];
const TITLES = ['Wire up', 'Refactor', 'Document', 'Review', 'Prototype', 'Fix flaky', 'Migrate', 'Audit', 'Polish', 'Spike on'];
const THINGS = ['the widget cache', 'sample importer', 'demo exporter', 'placeholder panel', 'fake queue', 'example webhook', 'mock scheduler', 'dummy settings page'];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.UTC(2026, 5, 15, 9, 30));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export type MockEpic = { dto: EpicDTO; tasks: TaskDTO[] };

function buildEpic(spec: EpicSpec, index: number): MockEpic {
  const rand = mulberry32(1000 + index);
  const tasks: TaskDTO[] = [];
  let n = 0;
  for (const key of [...bucketDefs.map((b) => b.key), 'none']) {
    const count = spec.counts[key] ?? 0;
    for (let i = 0; i < count; i++) {
      n++;
      const id = (index + 1) * 100 + n;
      const bucket = bucketDefs.find((b) => b.key === key);
      const done = bucket?.isDone ?? false;
      const flags: FlagDTO[] = [];
      tasks.push({
        id,
        ref: `DEMO-${id}`,
        title: `${TITLES[Math.floor(rand() * TITLES.length)]} ${THINGS[Math.floor(rand() * THINGS.length)]}`,
        url: `${BASE_URL}/tasks/${id}`,
        projectId: spec.root,
        bucketKey: bucket ? key : null,
        points: SCALE[Math.floor(rand() * SCALE.length)] ?? 3,
        done,
        doneAt: done ? isoDaysAgo(1 + Math.floor(rand() * 60)) : null,
        flags,
      });
    }
  }
  // Leave `unpointed` tickets without points, open ones first.
  let toStrip = spec.unpointed;
  for (const t of [...tasks].sort((a, b) => Number(a.done) - Number(b.done))) {
    if (toStrip <= 0) break;
    t.points = null;
    if (!t.done) t.flags.push({ type: 'unpointed-open', detail: 'Open task has no sp: label' });
    toStrip--;
  }
  const big = tasks.find((t) => t.points === 13 && !t.done);
  if (big) big.flags.push({ type: 'oversized', detail: '13 points is above the split threshold of 8' });
  if (spec.slug === '') for (const t of tasks) t.flags.push({ type: 'no-epic', detail: 'Task belongs to no epic' });

  const buckets: BucketCountDTO[] = [...bucketDefs.map((b) => b.key as string | null), null]
    .map((key) => {
      const own = tasks.filter((t) => t.bucketKey === key);
      return {
        bucketKey: key,
        tasks: own.length,
        points: own.reduce((s, t) => s + (t.points ?? 0), 0),
        unpointed: own.filter((t) => t.points === null).length,
      };
    })
    .filter((b) => b.tasks > 0);

  const done = tasks.filter((t) => t.done);
  const open = tasks.filter((t) => !t.done);
  const doneDates = done.map((t) => t.doneAt ?? '').sort();
  const status: EpicStatus = done.length === tasks.length && tasks.length > 0 ? 'done' : done.length === 0 && !tasks.some((t) => t.bucketKey === 'in-progress') ? 'not-started' : 'in-progress';
  const rollup: RollupDTO = {
    pointsTotal: tasks.reduce((s, t) => s + (t.points ?? 0), 0),
    pointsDone: done.reduce((s, t) => s + (t.points ?? 0), 0),
    tasksTotal: tasks.length,
    tasksDone: done.length,
    unpointedOpen: open.filter((t) => t.points === null).length,
    status,
    lastCompletedAt: doneDates[doneDates.length - 1] ?? null,
    buckets,
  };
  const root = mockProjects.find((p) => p.id === spec.root);
  const isNoEpic = spec.slug === '';
  const dto: EpicDTO = {
    key: `${spec.root}:${spec.slug}`,
    slug: spec.slug,
    name: spec.name,
    isNoEpic,
    source: isNoEpic ? null : spec.source,
    rootProjectId: spec.root,
    rootProjectTitle: root?.title ?? 'Unknown',
    parentTask: spec.source === 'parent' && !isNoEpic ? { id: 9000 + index, ref: `DEMO-${9000 + index}`, url: `${BASE_URL}/tasks/${9000 + index}` } : null,
    rollup,
  };
  return { dto, tasks };
}

const STATUS_ORDER: Record<EpicStatus, number> = { 'in-progress': 0, 'not-started': 1, done: 2 };

export const mockEpics: MockEpic[] = specs
  .map(buildEpic)
  .sort((a, b) => {
    if (a.dto.isNoEpic !== b.dto.isNoEpic) return a.dto.isNoEpic ? 1 : -1;
    const s = STATUS_ORDER[a.dto.rollup.status] - STATUS_ORDER[b.dto.rollup.status];
    if (s !== 0) return s;
    return b.dto.rollup.pointsTotal - b.dto.rollup.pointsDone - (a.dto.rollup.pointsTotal - a.dto.rollup.pointsDone);
  });

export function sumRollups(rollups: RollupDTO[]): RollupDTO {
  const byKey = new Map<string | null, BucketCountDTO>();
  for (const r of rollups)
    for (const b of r.buckets) {
      const cur = byKey.get(b.bucketKey) ?? { bucketKey: b.bucketKey, tasks: 0, points: 0, unpointed: 0 };
      cur.tasks += b.tasks;
      cur.points += b.points;
      cur.unpointed += b.unpointed;
      byKey.set(b.bucketKey, cur);
    }
  const last = rollups.map((r) => r.lastCompletedAt ?? '').sort().pop() || null;
  const sum = (f: (r: RollupDTO) => number): number => rollups.reduce((s, r) => s + f(r), 0);
  return {
    pointsTotal: sum((r) => r.pointsTotal),
    pointsDone: sum((r) => r.pointsDone),
    tasksTotal: sum((r) => r.tasksTotal),
    tasksDone: sum((r) => r.tasksDone),
    unpointedOpen: sum((r) => r.unpointedOpen),
    status: 'in-progress',
    lastCompletedAt: last,
    buckets: [...byKey.values()],
  };
}

export function mockVelocity(): WeekDTO[] {
  const pts = [8, 13, 5, 21, 16, 9, 0, 18, 24, 13, 20, 17];
  return pts.map((points, i) => {
    const d = new Date(Date.UTC(2026, 2, 23));
    d.setUTCDate(d.getUTCDate() + i * 7);
    return { weekStart: d.toISOString().slice(0, 10), points, tasks: Math.ceil(points / 3) };
  });
}

/** 6 weeks reconstructed from task dates, then daily-ish snapshots. */
export function mockBurnup(epic: EpicDTO): BurnupPointDTO[] {
  const total = epic.rollup.pointsTotal;
  const done = epic.rollup.pointsDone;
  const tTotal = epic.rollup.tasksTotal;
  const tDone = epic.rollup.tasksDone;
  const out: BurnupPointDTO[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const d = new Date(Date.UTC(2026, 3, 27));
    d.setUTCDate(d.getUTCDate() + i * 4);
    // scope creeps up in two steps; done grows steadily
    const scopeFrac = 0.6 + 0.4 * Math.min(1, Math.floor(frac * 3) / 2 + frac * 0.1);
    out.push({
      date: d.toISOString().slice(0, 10),
      scopePoints: Math.round(total * Math.min(1, scopeFrac)),
      donePoints: Math.round(done * frac),
      scopeTasks: Math.round(tTotal * Math.min(1, scopeFrac)),
      doneTasks: Math.round(tDone * frac),
      source: i < 8 ? 'reconstructed' : 'snapshot',
    });
  }
  return out;
}

export function mockHygiene(): HygieneResponse {
  const all = mockEpics.flatMap((e) => e.tasks);
  const group = (type: HygieneGroupDTO['type'], label: string, tasks: TaskDTO[]): HygieneGroupDTO => ({ type, label, tasks });
  const withFlag = (type: HygieneGroupDTO['type']): TaskDTO[] => all.filter((t) => t.flags.some((f) => f.type === type));
  const odd: TaskDTO[] = [
    { id: 7001, ref: 'DEMO-7001', title: 'Sample task with two sp: labels', url: `${BASE_URL}/tasks/7001`, projectId: 1, bucketKey: 'to-do', points: 5, done: false, doneAt: null, flags: [{ type: 'conflicting-points', detail: 'Labels sp:3 and sp:5 disagree' }] },
    { id: 7002, ref: 'DEMO-7002', title: 'Example task with a typo label', url: `${BASE_URL}/tasks/7002`, projectId: 1, bucketKey: null, points: null, done: false, doneAt: null, flags: [{ type: 'invalid-points', detail: 'Label "sp:five" is not a number' }] },
    { id: 7003, ref: 'DEMO-7003', title: 'Placeholder task marked done in the wrong bucket', url: `${BASE_URL}/tasks/7003`, projectId: 3, bucketKey: 'to-do', points: 2, done: true, doneAt: isoDaysAgo(4), flags: [{ type: 'done-bucket-mismatch', detail: 'Marked done but sits in "To do"' }] },
  ];
  const groups = [
    group('oversized', 'Oversized tasks', withFlag('oversized')),
    group('unpointed-open', 'Unpointed open tasks', withFlag('unpointed-open')),
    group('no-epic', 'Tasks with no epic', withFlag('no-epic')),
    group('invalid-points', 'Invalid sp: values', odd.slice(1, 2)),
    group('done-bucket-mismatch', 'Done/bucket mismatches', odd.slice(2)),
    group('conflicting-points', 'Conflicting sp: labels', odd.slice(0, 1)),
  ].filter((g) => g.tasks.length > 0);
  return {
    groups,
    unmatchedBuckets: [
      { projectId: 2, projectTitle: 'Sample Mobile App', bucketName: 'QA Sign-off' },
      { projectId: 2, projectTitle: 'Sample Mobile App', bucketName: 'Parked' },
    ],
    sync: { lastSuccessAt: null, lastAttemptAt: null, error: null, vikunjaVersion: null, syncing: false },
  };
}
