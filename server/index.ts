import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import { registerRoutes } from './routes/index.js';
import { createSnapshotsHook } from './snapshots/hook.js';
import { SnapshotStore } from './snapshots/store.js';
import { Syncer } from './sync/index.js';
import { VikunjaClient } from './vikunja/client.js';

const config = loadConfig();
const app = Fastify({ logger: true });

const client = new VikunjaClient({ baseUrl: config.vikunjaApiUrl, token: config.vikunjaToken });
const syncer = new Syncer({ config, client, logger: app.log });

const store = SnapshotStore.open(config.dataDir);
const snapshots = createSnapshotsHook(store, {
  snapshotTime: config.snapshotTime,
  tz: config.tz,
  log: { info: (m) => app.log.info(m), error: (m, err) => app.log.error({ err }, m) },
});

registerRoutes(app, {
  config,
  syncer,
  snapshotRowsForEpic: (p: number, s: string) => snapshots.rowsForEpic(p, s),
});

// In production the built SPA sits next to the built server (dist/web beside dist/server).
// In development Vite serves the SPA and proxies /api here.
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../web');
if (existsSync(resolve(webRoot, 'assets'))) {
  await app.register(fastifyStatic, { root: webRoot });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/') ? reply.code(404).send({ error: 'not found' }) : reply.sendFile('index.html'),
  );
}

await app.listen({ host: '0.0.0.0', port: config.port });

// Initial sync runs in the background so /healthz answers (503) while it is in progress.
// The daily snapshot job starts once that first sync settles, so today's row (written right
// away if missing) comes from real data.
let stopDaily: (() => void) | undefined;
void syncer.start().finally(() => {
  if (!closing) stopDaily = snapshots.startDaily(() => syncer.model);
});

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received, shutting down`);
  syncer.stop();
  stopDaily?.();
  await app.close();
  store.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
