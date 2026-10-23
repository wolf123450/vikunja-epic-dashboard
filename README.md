# vikunja-epic-dashboard

A small, self-hosted, read-only dashboard that rolls [Vikunja](https://vikunja.io) tasks up into epic-level progress. It uses labels for story points and epics, plus parent tasks marked as epics. It shows per-epic progress, a burn-up chart, velocity, and a hygiene view for tasks that are missing points or an epic.

> [!WARNING]
> **This app has no login.** It holds a Vikunja API token on the server and shows task data to anyone who can reach it. Expose it only on a trusted LAN, or behind a reverse proxy that does authentication. Never publish it directly to the internet.

The app never writes to Vikunja. The token stays on the server; the browser only talks to this app.

See [SPEC.md](SPEC.md) for the full design.

## Label conventions

| Convention | Example | Meaning |
| --- | --- | --- |
| Story points | `sp:5`, `sp:0.5` | Points for a task. Any positive number works, decimals included. |
| Epic label | `epic:inventory-system` | Puts a task in the epic with that slug. |
| Epic parent | a task labelled `epic` | Its subtasks (parent relation) belong to that epic. |

Prefixes and the marker label are configurable (`POINTS_PREFIX`, `EPIC_PREFIX`, `EPIC_MARKER_LABEL`). `EPIC_MODE` selects label epics, parent epics, or both. `POINTS_SCALE` is an optional suggested scale (for example `1,2,3,5,8,13,21,40`). It only flags off-scale values and never rejects them. It replaces the old `POINTS_ALLOWED` setting.

## Create the API token

Create a dedicated token in Vikunja (Settings, API Tokens):

- Set an expiry, so you can revoke or rotate it easily.
- Grant read access only: **projects**, **tasks**, and **labels**.
- No bucket scope is needed. The app does not call `GET .../buckets`.

Put the token in `VIKUNJA_TOKEN` in your `.env` file. Do not commit that file.

## Deploy with Docker Compose

Run the dashboard on the same Docker network as Vikunja.

1. Copy `.env.example` to `.env`. Set `VIKUNJA_API_URL` (for example `http://vikunja:3456`) and `VIKUNJA_TOKEN`.
2. Find Vikunja's network name with `docker network ls`. Set `VIKUNJA_NETWORK` in `.env` to that name. The default is `vikunja_default`.
3. Start it:

   ```bash
   docker compose up -d --build
   ```

4. Open `http://<host>:8080`.

Daily snapshots are stored in `/data/snapshots.db`. The compose file keeps `/data` in the named volume `dashboard-data`. Back up this volume to keep exact burn-up history. The image runs as the non-root `node` user and has a health check on `GET /healthz`.

## Configuration

All settings are environment variables. The app validates them at startup and refuses to start on an invalid value.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VIKUNJA_API_URL` | (required) | Base URL the server uses to reach Vikunja, for example `http://vikunja:3456` |
| `VIKUNJA_PUBLIC_URL` | = API URL | Base URL for task deep links in the browser |
| `VIKUNJA_TOKEN` | (required) | Read-only API token; never sent to the browser |
| `PROJECT_IDS` | all visible | Comma-separated project IDs offered in the picker |
| `INCLUDE_CHILD_PROJECTS` | `true` | Roll child projects into their parent |
| `POINTS_PREFIX` | `sp:` | Story-point label prefix |
| `POINTS_SCALE` | (unset) | Optional suggested scale, for example `1,2,3,5,8,13,21,40`. Off-scale values still count |
| `POINTS_SPLIT_THRESHOLD` | `5` | Tasks pointed above this are flagged to split or promote to an epic |
| `EPIC_MODE` | `both` | `label`, `parent`, or `both` |
| `EPIC_ALLOW_OVERLAP` | `true` | When `false`, tasks in more than one epic are flagged |
| `EPIC_PARENT_POINTS` | `false` | Count a parent-mode epic task's own points toward its epic |
| `EPIC_PREFIX` | `epic:` | Epic label prefix (label mode) |
| `EPIC_MARKER_LABEL` | `epic` | Marker label for parent-mode epics |
| `SYNC_INTERVAL_SEC` | `300` | Full resync interval in seconds (minimum 10) |
| `SNAPSHOT_TIME` | `03:00` | Local time (`HH:MM`) for the daily snapshot |
| `TZ` | `America/Los_Angeles` | Week boundaries and snapshot timing |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `/data` | SQLite location (mount a volume) |
| `KANBAN_VIEW_ID` | first Kanban view | Kanban view for the epic card buckets, as `projectId:viewId` pairs |
| `BUCKET_COLORS` | palette by position | Optional `bucketName:#hex` overrides |
| `VIKUNJA_NETWORK` | `vikunja_default` | Compose only: name of Vikunja's Docker network |

## Development

```bash
npm ci
cp .env.example .env   # set VIKUNJA_API_URL and VIKUNJA_TOKEN
npm run dev:server     # API server with reload
npm run dev:web        # Vite dev server for the SPA
```

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript and vue-tsc checks |
| `npm test` | Vitest |
| `npm run build` | Build the SPA and the server |
| `npm run live-check` | Read your real instance and print counts and timing only (needs `.env`) |
| `npm run fixtures:record` | Re-record scrubbed fixtures; review the diff before you commit |

## License

[AGPL-3.0](LICENSE) © wolf123450
