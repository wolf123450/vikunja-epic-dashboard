/**
 * Records scrubbed Vikunja responses into fixtures/ for tests.
 *   npm run fixtures:record -- [projectId]
 * Reads VIKUNJA_API_URL / VIKUNJA_TOKEN from .env. Defaults to the project with the most tasks.
 * Review the output (git diff fixtures/) before committing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../server/config.js';
import { scrub } from './scrub.js';

const config = loadConfig();
const api = `${config.vikunjaApiUrl.replace(/\/api\/v1$/, '')}/api/v1`;
const headers = { Authorization: `Bearer ${config.vikunjaToken}` };
const outDir = join(import.meta.dirname, '..', 'fixtures');
const hosts = [...new Set([config.vikunjaApiUrl, config.vikunjaPublicUrl].map((u) => new URL(u).host))];
const scrubOpts = {
  hosts,
  keepLabelPrefixes: [config.pointsPrefix, config.epicPrefix],
  keepLabels: [config.epicMarkerLabel],
};

type Entry = { file: string; path: string; pagination: Record<string, string> };
const manifest: Entry[] = [];

async function record(file: string, path: string): Promise<unknown> {
  const res = await fetch(api + path, { headers });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  const body: unknown = await res.json();
  const pagination = Object.fromEntries([...res.headers].filter(([k]) => k.startsWith('x-pagination')));
  writeFileSync(join(outDir, file), JSON.stringify(scrub(body, scrubOpts), null, 2) + '\n');
  manifest.push({ file, path, pagination });
  console.log(`${file.padEnd(28)} GET ${path}`);
  return body;
}

mkdirSync(outDir, { recursive: true });
await record('info.json', '/info');
const projects = (await record('projects.json', '/projects?page=1&per_page=50')) as { id: number }[];

let projectId = Number(process.argv[2]);
if (!projectId) {
  let most = -1;
  for (const p of projects.filter((p) => p.id > 0)) {
    const r = await fetch(`${api}/tasks?per_page=1&filter=${encodeURIComponent(`project in ${p.id}`)}`, { headers });
    const n = Number(r.headers.get('x-pagination-total-pages') ?? 0);
    if (n > most) [most, projectId] = [n, p.id];
  }
}

const views = (await record('views.json', `/projects/${projectId}/views`)) as { id: number; view_kind: string }[];
const kanban = views.find((v) => v.view_kind === 'kanban');
if (kanban) {
  const buckets = (await record(
    'kanban-view-tasks.json',
    `/projects/${projectId}/views/${kanban.id}/tasks?page=1&per_page=50`,
  )) as { id: number; count: number; tasks: unknown[] | null }[];
  const big = buckets.find((b) => b.count > (b.tasks?.length ?? 0));
  if (big) {
    const q = `filter=${encodeURIComponent(`bucket_id = ${big.id}`)}&per_page=50`;
    await record('kanban-bucket-page1.json', `/projects/${projectId}/views/${kanban.id}/tasks?${q}&page=1`);
  }
}
const tq = `filter=${encodeURIComponent(`project in ${projectId}`)}&per_page=50`;
await record('tasks-page1.json', `/tasks?${tq}&page=1`);
await record('tasks-page2.json', `/tasks?${tq}&page=2`);
await record('labels.json', '/labels?page=1&per_page=50');

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ projectId, entries: manifest }, null, 2) + '\n');
console.log(`\nRecorded project ${projectId}. Review fixtures/ before committing.`);
