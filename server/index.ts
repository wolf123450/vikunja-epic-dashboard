import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import type { Model, SnapshotRow } from './domain/types.js';
import { registerRoutes } from './routes/index.js';
import { Syncer } from './sync/index.js';
import { VikunjaClient } from './vikunja/client.js';

/**
 * Hook point for the SQLite snapshot store (milestone 5). Supply an object with these members
 * and the burn-up endpoint merges its rows, and the daily job starts after the first sync.
 */
export type SnapshotsHook = {
  rowsForEpic(projectId: number, epicSlug: string): SnapshotRow[] | Promise<SnapshotRow[]>;
  /** Start the daily snapshot job; return a function that stops it. */
  startDaily(getModel: () => Model | null): () => void;
};

const config = loadConfig();
const app = Fastify({ logger: true });

const client = new VikunjaClient({ baseUrl: config.vikunjaApiUrl, token: config.vikunjaToken });
const syncer = new Syncer({ config, client, logger: app.log });

// WIRE-SNAPSHOTS: replace `undefined` with the SQLite store (opened in config.dataDir) once it lands.
const snapshots = undefined as SnapshotsHook | undefined;

registerRoutes(app, {
  config,
  syncer,
  ...(snapshots ? { snapshotRowsForEpic: (p: number, s: string) => snapshots.rowsForEpic(p, s) } : {}),
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
void syncer.start();
const stopDaily = snapshots?.startDaily(() => syncer.model);

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received, shutting down`);
  syncer.stop();
  stopDaily?.();
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
