# vikunja-epic-dashboard

A small, self-hosted, read-only dashboard that rolls [Vikunja](https://vikunja.io) tasks up into epic-level progress, using label conventions for story points (`sp:5`) and epics (`epic:inventory-system`, or parent tasks marked `epic`).

> **Status:** early development. See [SPEC.md](SPEC.md) for the design and delivery plan.

> [!WARNING]
> **This app has no login.** It holds a Vikunja API token server-side and shows task data to anyone who can reach it. Expose it only on a trusted LAN or behind an existing reverse proxy that does authentication.

## Quick start (development)

```bash
npm ci
cp .env.example .env   # set VIKUNJA_API_URL and VIKUNJA_TOKEN
npm run dev:server
npm run dev:web
```

Use a dedicated Vikunja API token with read-only scopes (projects, tasks, labels) and an expiry.

## License

[AGPL-3.0](LICENSE) © wolf123450
