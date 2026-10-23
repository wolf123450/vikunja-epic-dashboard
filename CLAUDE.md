# CLAUDE.md

The full spec is [SPEC.md](SPEC.md); mockups are in [docs/mockups.pdf](docs/mockups.pdf). Read the spec before starting a milestone.

## What this is

A read-only, self-hosted dashboard that rolls Vikunja tasks up into epic progress, using labels (`sp:<n>`, `epic:<slug>`) and parent-task relations. Single container: Fastify + TypeScript server, Vue 3 SPA, SQLite snapshots.

## Layout

- `server/vikunja/` API client, pagination, zod schemas
- `server/domain/` label parsing, epic resolution, rollups. **Pure functions, no I/O.**
- `server/snapshots/` SQLite schema + daily job
- `server/routes/` dashboard REST endpoints
- `web/` Vue SPA
- `fixtures/` recorded Vikunja responses (scrubbed)

## Commands

- `npm run dev:server` / `npm run dev:web`
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

## Working rules

- One branch per milestone (`m1-api-client`, `m2-domain`, ...), merged by PR. `main` stays runnable and CI-green. Tag each merged milestone (`v0.1.0` after m1, ...).
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), small and logical. Tests land with the code.
- When implementation changes or resolves anything in the spec, update `SPEC.md` in the same commit.
- Validate every Vikunja response with zod; a validation failure is a hard error naming the field.
- No writes to Vikunja in v1.
- UI is dark by default (not OS-driven); light is opt-in via `data-theme="light"`. All colours are CSS custom properties.

## Secrets and identity

- Never commit a token, a real `.env`, real hostnames, or personal task titles/user details. Scrub fixtures.
- gitleaks runs as a pre-commit hook (`.githooks/`, enabled via `git config core.hooksPath .githooks`) and in CI.
- Public attribution is `wolf123450` only. Never put the owner's real name in anything committed. Git identity is set per repo.
