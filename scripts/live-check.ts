/**
 * Runs a full read through the client against the real instance and reports counts and
 * timing (no task content). Exercises every schema on live data.
 *   npm run live-check
 */
import { loadConfig } from '../server/config.js';
import { VikunjaClient } from '../server/vikunja/client.js';
import { fetchBoard } from '../server/vikunja/kanban.js';

const config = loadConfig();
const client = new VikunjaClient({ baseUrl: config.vikunjaApiUrl, token: config.vikunjaToken });

const t0 = performance.now();
const info = await client.info();
console.log(`Vikunja ${info.version}, page size ${info.max_items_per_page}`);

const projects = await client.projects();
const selected = config.projectIds ? projects.filter((p) => config.projectIds?.includes(p.id)) : projects;
const tasks = await client.tasks({ filter: `project in ${selected.map((p) => p.id).join(', ')}` });
console.log(`${selected.length} projects, ${tasks.length} tasks (${tasks.filter((t) => t.done).length} done)`);

for (const p of selected) {
  const board = await fetchBoard(client, p.id, await client.views(p.id), config.kanbanViewIds.get(p.id));
  if (!board) {
    console.log(`project ${p.id}: no Kanban view`);
    continue;
  }
  const projectTasks = tasks.filter((t) => t.project_id === p.id);
  const unbucketed = projectTasks.filter((t) => !board.taskBucket.has(t.id)).length;
  const sizes = board.buckets.map((b) => [...board.taskBucket.values()].filter((id) => id === b.id).length);
  console.log(
    `project ${p.id}: view ${board.viewId}, ${board.buckets.length} buckets [${sizes.join(', ')}], ` +
      `done bucket ${board.doneBucketId || 'none'}, ${unbucketed} tasks not on board`,
  );
}
const labels = await client.labels();
console.log(`${labels.length} labels`);
console.log(`full read took ${((performance.now() - t0) / 1000).toFixed(2)} s`);
