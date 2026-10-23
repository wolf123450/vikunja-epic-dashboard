import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = Fastify({ logger: true });

// Placeholder until the sync loop lands (milestone 3).
app.get('/healthz', async (_req, reply) => reply.code(503).send({ ok: false, reason: 'no sync has run yet' }));

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
