# Vikunja Epic Dashboard — Project Spec

Oct 23, 2026 · wolf123450

## Overview

Build a small, self-hosted, read-only dashboard that rolls Vikunja tasks up into epic-level progress, using label conventions for story points and epics. It reads only Vikunja's stock REST API, so it needs no plugin, no fork, and no migration of the existing \~1k tickets.

**Goals**

- Show per-epic progress as both points done/total and tasks done/total.
- Surface estimation debt: unpointed tasks, tasks with no epic, conflicting labels.
- Show a burn-up over time per epic (scope vs completed), so scope creep is visible.
- Stay portable: depend only on the public API, so the dashboard survives Vikunja upgrades, a fork, or a later tool switch.

**Non-goals (v1)**

- No writes to Vikunja in v1, because none of these features need them. This is a scope choice, not a rule: writes (e.g. fixing labels from the hygiene view) are fair game later. Points and epics are edited in Vikunja itself, as labels.
- No multi-user auth. One server-side API token, deployed on a trusted LAN or behind an existing reverse proxy.
- No sprint planning, assignment, or time tracking.
- No Vikunja plugin or frontend fork.

## Conventions

All metadata lives in ordinary Vikunja labels and task relations, so it can be bulk-applied to existing tickets in the stock UI. Prefixes are configurable (see Config).

| Concept | Convention | Example | Rules |
| --- | --- | --- | --- |
| Story points | Label `sp:<n>` | `sp:5` | `n` must be in the allowed set (default 1, 2, 3, 5, 8, 13, 20, 40). Unknown values are flagged, not counted. |
| Epic (label mode) | Label `epic:<slug>` | `epic:inventory-system` | A task belongs to every epic label it carries. Display name = slug with dashes replaced by spaces, title-cased. |
| Epic (parent mode) | Parent task carrying marker label `epic` | Task "Inventory system" + label `epic` | Members = its `subtask` relations, recursively. The parent's own points are ignored by default. |
| Unpointed | Task with no `sp:` label |  | Counted separately, never as 0 points. |

**Edge cases the parser must handle**

- Multiple `sp:` labels on one task: flag as a conflict and use the highest value.
- A task in both a label-mode and a parent-mode epic: counts toward both; flag only if config disallows overlap.
- Subtask cycles in parent mode: detect and stop recursion; flag the cycle.
- Label matching is case-insensitive and trims whitespace (`SP:5`, `sp: 5` both parse).
- Done tasks keep their points; a task reopened after `done_at` counts as open.

**Merging in `both` mode:** a parent-mode epic's slug comes from its own `epic:<slug>` label if it has one, else from its title. Tasks carrying that same `epic:<slug>` label join the parent's epic, so existing parent tasks keep working and loose tickets can be pulled in by label without re-parenting them.

**Oversized tasks:** a task pointed above `POINTS_SPLIT_THRESHOLD` (default 5) still counts normally, but is flagged in the hygiene view as a candidate to split into smaller tasks or promote to an epic.

## Architecture

One container: a TypeScript backend that holds the token, syncs from Vikunja, computes rollups, and serves a Vue SPA. A small SQLite file stores daily snapshots so burn-up history becomes exact from day one of deployment.

*Figure: architecture · one container, read-only to Vikunja — see [docs/mockups.pdf](docs/mockups.pdf).*

The browser only talks to the dashboard server; the server alone holds the token and reads Vikunja.

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node 22 LTS, TypeScript strict | Matches existing skills; one language end to end |
| HTTP server | Fastify | Small, typed, serves API + static SPA |
| Frontend | Vue 3 + Vite, Composition API | Same framework as Vikunja's frontend |
| Charts | Apache ECharts | Fully open (Apache-2.0), handles burn-up and stacked bars well |
| Storage | SQLite via better-sqlite3 | Snapshots only; Vikunja stays the source of truth |
| Validation | zod | Validate Vikunja responses at the boundary; fail loudly on API drift |
| Tests | Vitest + recorded JSON fixtures | Rollup logic tested without a live Vikunja |
| Packaging | Dockerfile + compose snippet | Runs next to the existing Vikunja container |

**Suggested repo layout**

```
server/
  vikunja/      # API client, pagination, zod schemas
  domain/       # label parsing, epic resolution, rollups (pure functions)
  snapshots/    # SQLite schema + daily snapshot job
  routes/       # dashboard REST endpoints
web/            # Vue SPA
fixtures/       # recorded Vikunja responses for tests
```

Keep `domain/` free of I/O. Every metric in this spec should be computable from an in-memory array of tasks, which makes it trivially testable.

## Vikunja API integration

**First task for the implementer: verify every endpoint below against the running instance's own OpenAPI spec (`/api/v1/docs.json`) before writing the client.** The shapes below are from general knowledge of Vikunja's v1 API, and task-listing endpoints changed when project views were introduced. Record the confirmed shapes as zod schemas and as fixtures.

**Endpoints expected to be needed (read-only)**

| Purpose | Expected endpoint | Notes |
| --- | --- | --- |
| Server version | `GET /api/v1/info` | Log it at startup; warn if outside the tested range (target: v2.7.0) |
| Projects | `GET /api/v1/projects` | Include child projects when `INCLUDE_CHILD_PROJECTS=true` |
| Tasks in a project | `GET /api/v1/projects/{id}/views/{viewId}/tasks` or `GET /api/v1/tasks/all` with a project filter | Pick whichever the instance supports; must return labels and related tasks |
| Labels | `GET /api/v1/labels` | Optional; useful for the hygiene view |

**Fields used from each task**

- `id`, `identifier` / `index`, `title`, `project_id`
- `done`, `done_at`, `created`, `updated`
- `labels[].title`
- `related_tasks.subtask[]`, `related_tasks.parenttask[]` (parent mode)

**Kanban buckets (for the epic cards view)**

- Buckets belong to a project's Kanban view, not to the project. Use the view named by `KANBAN_VIEW_ID`, else the project's first Kanban view.
- Fetch the bucket list (name, position) and each task's bucket for that view. The Kanban view's task listing may return buckets with their tasks nested, which gives both in one call; verify against the OpenAPI spec.
- With `INCLUDE_CHILD_PROJECTS=true`, child projects have their own buckets: match them to the parent's buckets by name, case-insensitive. Unmatched buckets are appended after the parent's and flagged in the hygiene view.
- Add `bucket: { id: number; name: string; position: number } | null` to the normalized `Task`.

**Client requirements**

- Paginate with `page` and `per_page` (max the server allows) until the pagination headers say there are no more pages.
- Bearer auth with a Vikunja API token scoped read-only to projects, tasks, and labels.
- Full resync on an interval (default 5 minutes) plus a manual refresh endpoint. At \~1k tasks a full resync is cheap; skip incremental sync in v1.
- Treat a zod validation failure as a hard error with a clear log line naming the field, not a silent partial dashboard.
- Build task deep links as `{VIKUNJA_PUBLIC_URL}/tasks/{id}`.

**Normalized internal model**

```ts
type Task = {
  id: number; ref: string; title: string; projectId: number;
  done: boolean; doneAt: Date | null; createdAt: Date;
  points: number | null;          // null = unpointed
  epicSlugs: string[];            // from labels and/or parent resolution
  flags: Flag[];                  // conflict, unknown-points, cycle, ...
  url: string;
};
type Epic = { slug: string; name: string; source: 'label' | 'parent'; parentTaskId?: number };
```

## Metrics and rollups

Every epic reports points and task counts side by side, because points hide count and count hides size. Unpointed work is always shown, never folded into zero.

| Metric | Definition |
| --- | --- |
| Points total | Sum of `points` over pointed member tasks |
| Points done | Sum of `points` over pointed member tasks with `done = true` |
| Points % | Points done / points total; shown as "n/a" when total is 0 |
| Tasks total / done | Count of all member tasks / of those done, pointed or not |
| Unpointed open | Count of open member tasks with `points = null` (estimation debt) |
| Status | Done if all tasks done; Not started if 0 done; else In progress |
| Velocity | Points completed per ISO week, from `done_at`, project-wide and per epic |
| Forecast (optional) | Remaining points / trailing 4-week velocity, shown as a range in weeks; hidden if fewer than 3 weeks of history |

**Done flag vs done bucket:** points, task counts, status, velocity, and burn-up all use the task's `done` flag. The epic cards bar uses bucket membership only. A task whose `done` flag disagrees with being in the Kanban view's configured done bucket (possible when the view has no done bucket set) is flagged in the hygiene view as a done/bucket mismatch.

**Burn-up history**

Vikunja doesn't expose when a label was added, so true historical scope can't be reconstructed. Use two sources and label them clearly in the UI:

1. **Reconstructed (before deployment):** completed line from `done_at`; scope line places each task's *current* points at its `created` date. This is an approximation, and the chart should say so.
2. **Snapshotted (after deployment):** a daily job writes per-epic totals to SQLite. From then on, both lines are exact, including scope changes from re-pointing.

Snapshot table: `snapshots(date TEXT, project_id INT, epic_slug TEXT, points_total INT, points_done INT, tasks_total INT, tasks_done INT, unpointed_open INT, PRIMARY KEY(date, project_id, epic_slug))`. The job is idempotent per day: re-running replaces that day's rows.

**Dashboard REST endpoints (served by this app)**

- `GET /api/projects` returns projects with epic counts.
- `GET /api/projects/:id/epics` returns rollups, including per-bucket ticket and point counts, for every epic, plus a "No epic" bucket.
- `GET /api/projects/:id/epics/:slug` returns the rollup, member tasks, and burn-up series.
- `GET /api/projects/:id/hygiene` returns flagged tasks grouped by flag type.
- `GET /api/projects/:id/velocity` returns weekly points completed.
- `POST /api/refresh` triggers an immediate resync.

Multi-project views use the same shapes without the `:id`: `GET /api/epics?projects=12,15`, and likewise `/api/hygiene` and `/api/velocity`, aggregate across the selected projects.

## UI views

Four screens plus a project picker. Design for a desktop browser first, but keep the epic list usable at phone width.

**Project picker and filter** (header of every screen)

- Single-select switches the whole dashboard to one project; multi-select combines projects, and each epic then shows its project as a small tag.
- Type-to-filter in the dropdown; child projects nest under their parent.
- The selection lives in the URL (`?projects=12,15`) so a filtered view can be bookmarked. Default is every project in `PROJECT_IDS`.
- Epics are keyed by rollup root plus slug (the parent project when child projects are rolled in), so the same `epic:` label in a parent and its child merges into one epic, while in two unrelated projects it stays two epics.

1. **Epic overview (list, home for a project)**
   - One row per epic, sorted by status (In progress, Not started, Done), then by points remaining.
   - Each row: name, a dual progress bar (points and tasks), "13 / 34 pts", "9 / 21 tasks", unpointed-open badge, last-completed date.
   - A "No epic" row at the bottom so unassigned work stays visible.
   - Header: project totals, weekly velocity sparkline, last-sync time, refresh button.
2. **Epic cards (board)**
   - One card per epic in a responsive grid (3 columns on desktop, 1 on phone), same sort as the overview. A list/cards toggle switches between views 1 and 2.
   - Card: epic name, status, "13 / 34 pts · 9 / 21 tasks", unpointed-open badge.
   - Segmented progress bar: one segment per Kanban bucket, width = that bucket's share of the epic's tickets, in the bucket order from Vikunja (left to right, Backlog to Done). Empty buckets get no segment.
   - Each bucket keeps one colour on every card, so cards compare at a glance. Colours come from a fixed palette assigned by bucket position; the done bucket always uses the success colour; unbucketed tickets are grey. Per-bucket overrides in config.
   - A legend above the grid lists every bucket with its colour. Segments have a 1 px gap so adjacent colours stay distinct; colour is never the only carrier of meaning.
   - Hover, keyboard focus, or tap on a segment shows a tooltip: bucket name, ticket count and % of the epic, points in that bucket, unpointed tickets in it.
   - Toggle for segment width: ticket count (default) or points. In points mode, unpointed tickets add no width but still appear in the tooltip; an epic with no pointed tickets shows an empty bar labelled "unpointed".
   - Clicking a card opens Epic detail; clicking a segment opens Epic detail filtered to that bucket.
3. **Epic detail**
   - Burn-up chart: scope line and completed line in points, with a toggle for task counts. The reconstructed period is shaded and labelled "approximate".
   - Member task table: ref, title (links to Vikunja), bucket, points, done/open, done date, flags. Filter by bucket, open/done, and pointed/unpointed.
4. **Hygiene**
   - Grouped lists: oversized tasks (above the split threshold), unpointed open tasks, tasks with no epic, unknown `sp:` values, done/bucket mismatches, conflicting `sp:` labels, subtask cycles, unmatched child-project buckets.
   - Each item links straight to the task in Vikunja so it can be fixed there.

Visual style: plain, dense, and **dark by default**, regardless of the OS `prefers-color-scheme`. A light theme is available as an opt-in (header toggle, remembered per browser), implemented as `data-theme="light"` on the root element with all colours defined as CSS custom properties. Borrowing the spirit of Plane's clean list rows is fine; no component library is required.

### Mockups

Layout sketches with made-up sample data; names, counts, and colours are placeholders.

*Figure: epic cards · segmented bucket bars, tooltip shown on hover — see [docs/mockups.pdf](docs/mockups.pdf).*

Every card uses the same bucket colours, so a wall of grey backlog on one card versus green on another reads at a glance.

*Figure: epic overview list · points and tasks per epic, plus the No epic bucket — see [docs/mockups.pdf](docs/mockups.pdf).*

The list trades the bucket breakdown for density: one line per epic, with the unassigned "No epic" work kept in view at the bottom.

*Figure: epic detail · burn-up with approximate history shaded, member task table — see [docs/mockups.pdf](docs/mockups.pdf).*

The gap between the dashed scope line and the completed line is the remaining work; a rising scope line is scope creep, visible even when the percentage looks steady.

*Figure: hygiene · label problems grouped by type, each linking to the task — see [docs/mockups.pdf](docs/mockups.pdf).*

The hygiene view is the to-do list for tagging the existing \~1k tickets; its counts trending to zero is how you know the dashboard's numbers can be trusted.

## Config, deployment, security

All configuration is environment variables, validated with zod at startup; the app refuses to start on an invalid config.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VIKUNJA_API_URL` | (required) | Base URL the server uses to reach Vikunja, e.g. `http://vikunja:3456` on the compose network |
| `VIKUNJA_PUBLIC_URL` | = API URL | Base URL for task deep links in the browser |
| `VIKUNJA_TOKEN` | (required) | Read-only API token; never sent to the browser |
| `PROJECT_IDS` | all visible | Comma-separated project IDs offered in the picker |
| `INCLUDE_CHILD_PROJECTS` | `true` | Roll child projects into their parent |
| `POINTS_PREFIX` | `sp:` | Story-point label prefix |
| `POINTS_ALLOWED` | `1,2,3,5,8,13,20,40` | Valid point values |
| `EPIC_MODE` | `both` | `label`, `parent`, or `both` |
| `EPIC_PREFIX` | `epic:` | Epic label prefix (label mode) |
| `EPIC_MARKER_LABEL` | `epic` | Marker label for parent-mode epics |
| `SYNC_INTERVAL_SEC` | `300` | Full resync interval |
| `SNAPSHOT_TIME` | `03:00` | Local time for the daily snapshot |
| `TZ` | `America/Los_Angeles` | Week boundaries and snapshot timing |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `/data` | SQLite location (mount a volume) |
| `KANBAN_VIEW_ID` | first Kanban view | Kanban view whose buckets drive the epic cards; per project as projectId:viewId pairs |
| `BUCKET_COLORS` | palette by position | Optional bucketName:#hex overrides |
| `POINTS_SPLIT_THRESHOLD` | `5` | Tasks pointed above this are flagged to split or promote to an epic |

**Deployment**

- Multi-stage Dockerfile: build the SPA and server, ship a slim Node runtime image running as a non-root user.
- Provide a `docker-compose.yml` snippet that joins the same network as Vikunja and mounts `/data`.
- `GET /healthz` returns 200 when the last sync succeeded within 3 intervals, else 503 with the reason.

**Security**

- The token lives only on the server; the browser talks only to this app, so no CORS changes to Vikunja are needed.
- The app has no login. Expose it only on the LAN or behind the existing reverse proxy's auth; say this prominently in the README.
- Use a dedicated Vikunja token with read-only scopes (widen them only if a later version adds writes) and an expiry, so revoking it is painless.

## Repository and workflow

The project lives in its own new GitHub repo under the owner's account, and all development is tracked in git from the first commit. Set this up before milestone 1.

**Setup (milestone 0)**

1. Create the repo, suggested name `vikunja-epic-dashboard`. Use `gh repo create` if the GitHub CLI is authenticated; otherwise stop and ask the owner to create it, then add it as `origin`.
2. First commit: `SPEC.md` (this document), `docs/mockups.pdf`, a `CLAUDE.md` that points to `SPEC.md` and summarizes the conventions below, `.gitignore`, `.env.example`, `README.md` stub, and `LICENSE`.
3. Add CI (GitHub Actions) on every push and PR: lint, typecheck, unit tests, and a Docker build. Main must stay green.

**Working rules**

- `main` is always runnable. Work on one branch per milestone (`m1-api-client`, `m2-domain`, ...) and merge by PR, so each milestone has a reviewable diff.
- Commit small and often, one logical change per commit, using Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Tests and code for a change land in the same commit.
- Tag each merged milestone (`v0.1.0` after m1, and so on) so it's easy to roll back.
- Spec changes go in the same commit as the code that motivated them (see "Keep this spec current").

**Secrets and data**

- Never commit the Vikunja token or a real `.env`. Ship `.env.example` with placeholders only.
- `.gitignore` covers `node_modules/`, build output, `.env*` except `.env.example`, and the SQLite `data/` directory.
- Scrub recorded fixtures before committing: replace the token, real hostnames, and any personal task titles or user details with placeholders.
- Add a secret scanner (for example gitleaks) as a pre-commit hook and a CI step.

**Visibility, license, and identity (decided)**

- The repo is **public**, licensed **AGPL-3.0**.
- All public attribution is to the GitHub username **wolf123450**: the `LICENSE` copyright line, `README`, `package.json` author, and any credits.
- **Never put the owner's real name in anything pushed to GitHub**: commits, code, comments, docs, fixtures, or the spec. If a name is ever needed, use `wolf123450`.
- Set git identity per repo, not globally, so a machine's global config can't leak a real name: `git config user.name "wolf123450"` and `git config user.email` set to the GitHub noreply address shown in the owner's GitHub email settings.
- Before the first push, check `git log --format='%an <%ae>'` shows only that identity. If it doesn't, fix the history before pushing; history is much harder to clean after it's public.

## Delivery plan

After repo setup (milestone 0, above), build in five milestones, each ending with passing tests and something runnable.

**Keep this spec current:** when implementation changes or resolves anything here (an endpoint shape, a default, a convention), update `SPEC.md` in the same change.

**Milestones**

1. **API client + fixtures.** Verify endpoints against `/api/v1/docs.json`, write zod schemas, implement pagination, fetch Kanban buckets, record fixtures from the real instance with secrets scrubbed.
2. **Domain layer.** Label parsing, epic resolution (label and parent modes), flags, rollups, velocity. Pure functions, fully unit-tested.
3. **Dashboard API.** The REST endpoints above, sync loop, `/healthz`.
4. **UI.** Project picker, epic overview list, epic cards with bucket bars and tooltips, epic detail with reconstructed burn-up, hygiene view.
5. **Snapshots + packaging.** SQLite snapshot job, burn-up merging reconstructed and snapshotted data, Dockerfile, compose snippet, README.

**Required tests**

- Label parsing: case, whitespace, unknown values, multiple `sp:` labels, values above the split threshold.
- Epic resolution: overlapping epics, nested subtasks, cycle detection, same slug merging across a parent and child project, staying separate across unrelated projects.
- Rollups: empty epic, all-unpointed epic, reopened task, "No epic" bucket.
- Bucket breakdown: child-project buckets matched by name, unmatched buckets appended, points-mode widths excluding unpointed tickets, done/bucket mismatch detection.
- Velocity week boundaries in the configured time zone.
- Snapshot job idempotency (run twice on the same day, same result).
- Client: pagination across 3+ pages, schema failure surfaces a clear error.

**Acceptance criteria**

- [ ] Against the real instance, epic totals match a manual count for at least 3 sample epics.
- [ ] A full sync of \~1k tasks completes in under 10 seconds on the home server.
- [ ] Unpointed and unassigned tasks are visible on the overview without opening the hygiene view.
- [ ] Every task row links to the correct task in Vikunja.
- [ ] The burn-up visibly distinguishes approximate history from snapshotted history.
- [ ] The epic cards view shows one segment per non-empty bucket, the same colours on every card, and a tooltip on hover, keyboard focus, and tap.
- [ ] The project picker filters every view, supports multi-select, and the selection survives a reload via the URL.
- [ ] Oversized and done/bucket-mismatch tasks appear in the hygiene view.
- [ ] Revoking the token produces a clear error on `/healthz` and in the UI, not a blank page.
- [ ] `docker compose up` brings it up next to Vikunja with only env vars set.

**Open questions**

- Vikunja version (resolved): v2.7.0. This determines the task-listing endpoint.
- Epic mode (resolved): Default is both, since parent tasks are already in use and epic labels stay optional.
- Resolved: point scale is modified Fibonacci 1, 2, 3, 5, 8, 13, 20, 40; tasks above 5 get flagged to split or promote to an epic.
- Resolved: the dashboard covers one project or several at once, via a project picker with multi-select filtering.
