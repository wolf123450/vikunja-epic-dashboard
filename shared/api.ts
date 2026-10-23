// Dashboard REST API contract, shared by server/routes and web/. JSON-safe: dates are ISO
// strings (full timestamps) or YYYY-MM-DD (calendar dates in the configured TZ).
//
// Single-project endpoints are the multi-project ones with one id:
//   GET /api/projects                       -> ProjectsResponse
//   GET /api/epics?projects=12,15           -> EpicsResponse      (= /api/projects/:id/epics)
//   GET /api/epics/:key?projects=...        -> EpicDetailResponse (= /api/projects/:id/epics/:slug)
//   GET /api/hygiene?projects=...           -> HygieneResponse    (= /api/projects/:id/hygiene)
//   GET /api/velocity?projects=...&epic=key -> VelocityResponse   (= /api/projects/:id/velocity)
//   POST /api/refresh                       -> SyncStatus (after the resync finishes)
//   GET /healthz                            -> HealthResponse, 200 or 503
// `projects` omitted = every project in PROJECT_IDS (or all visible). Ids may be any project;
// they're mapped to rollup roots. Epic `key` is `${rootProjectId}:${slug}`, URL-encoded.
// Errors: { error: string } with a 4xx/5xx status. 503 + { error, sync } before the first sync.

export type FlagType =
  | 'conflicting-points'
  | 'invalid-points'
  | 'off-scale-points'
  | 'oversized'
  | 'unpointed-open'
  | 'no-epic'
  | 'epic-overlap'
  | 'subtask-cycle'
  | 'done-bucket-mismatch';

export type FlagDTO = { type: FlagType; detail: string };

export type EpicStatus = 'in-progress' | 'not-started' | 'done';

export type SyncStatus = {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  /** Message of the last failed sync, cleared on success. */
  error: string | null;
  vikunjaVersion: string | null;
  syncing: boolean;
};

export type ProjectDTO = {
  id: number;
  title: string;
  parentId: number | null;
  rootId: number; // rollup root (itself when top-level or child rollup is off)
  epicCount: number; // epics rooted here (0 for rolled-in children)
  taskCount: number;
};

export type ProjectsResponse = {
  projects: ProjectDTO[]; // only those offered in the picker, parents before children
  defaultSelection: number[];
  sync: SyncStatus;
};

export type BucketDTO = {
  key: string; // normalized bucket name; stable across projects
  name: string;
  position: number; // display order, left to right
  color: string; // #rrggbb, from shared/palette.ts
  isDone: boolean;
};

export type BucketCountDTO = {
  bucketKey: string | null; // null = not on the board (grey)
  tasks: number;
  points: number;
  unpointed: number;
};

export type RollupDTO = {
  pointsTotal: number;
  pointsDone: number;
  tasksTotal: number;
  tasksDone: number;
  unpointedOpen: number;
  status: EpicStatus;
  lastCompletedAt: string | null;
  buckets: BucketCountDTO[];
};

export type EpicDTO = {
  key: string; // `${rootProjectId}:${slug}`; the No-epic row uses slug ''
  slug: string;
  name: string; // "No epic" for the No-epic row
  isNoEpic: boolean;
  source: 'label' | 'parent' | null; // null for No epic
  rootProjectId: number;
  rootProjectTitle: string;
  parentTask: { id: number; ref: string; url: string } | null;
  rollup: RollupDTO;
};

export type WeekDTO = { weekStart: string; points: number; tasks: number };

export type EpicsResponse = {
  /** Union of the selected roots' buckets, merged by key, in display order. Legend source. */
  buckets: BucketDTO[];
  /** Real epics sorted by status (in progress, not started, done) then points remaining desc; No-epic rows last. */
  epics: EpicDTO[];
  totals: RollupDTO; // across all selected tasks
  velocity: WeekDTO[]; // last 12 ISO weeks, oldest first
  sync: SyncStatus;
};

export type TaskDTO = {
  id: number;
  ref: string;
  title: string;
  url: string;
  projectId: number;
  bucketKey: string | null;
  points: number | null;
  done: boolean;
  doneAt: string | null;
  flags: FlagDTO[];
};

export type BurnupPointDTO = {
  date: string; // YYYY-MM-DD
  scopePoints: number;
  donePoints: number;
  scopeTasks: number;
  doneTasks: number;
  source: 'reconstructed' | 'snapshot';
};

export type ForecastDTO = { weeksLow: number; weeksHigh: number } | null;

export type EpicDetailResponse = {
  epic: EpicDTO;
  buckets: BucketDTO[];
  tasks: TaskDTO[];
  burnup: BurnupPointDTO[];
  forecast: ForecastDTO;
  sync: SyncStatus;
};

export type HygieneGroupDTO = { type: FlagType; label: string; tasks: TaskDTO[] };

export type HygieneResponse = {
  /** One group per flag type that has tasks, in a fixed order (see server/routes). */
  groups: HygieneGroupDTO[];
  unmatchedBuckets: { projectId: number; projectTitle: string; bucketName: string }[];
  sync: SyncStatus;
};

export type VelocityResponse = { weeks: WeekDTO[]; forecast: ForecastDTO; sync: SyncStatus };

export type HealthResponse = { ok: boolean; reason: string | null; sync: SyncStatus };

export type ErrorResponse = { error: string; sync?: SyncStatus };
