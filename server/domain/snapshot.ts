import { epicTasks, noEpicTasks, rollup } from './rollup.js';
import { NO_EPIC_SLUG, type Model, type Rollup, type SnapshotRow } from './types.js';

function row(date: string, projectId: number, epicSlug: string, r: Rollup): SnapshotRow {
  return {
    date,
    projectId,
    epicSlug,
    pointsTotal: r.pointsTotal,
    pointsDone: r.pointsDone,
    tasksTotal: r.tasksTotal,
    tasksDone: r.tasksDone,
    unpointedOpen: r.unpointedOpen,
  };
}

/** One row per epic plus one No-epic row (epicSlug '') per rollup root that has tasks, for `date`. */
export function snapshotRows(model: Model, date: string): SnapshotRow[] {
  const rows = model.epics.map((e) => row(date, e.rootProjectId, e.slug, rollup(epicTasks(model, e.key))));
  const roots = [...new Set(model.tasks.map((t) => t.rootProjectId))].sort((a, b) => a - b);
  for (const root of roots) rows.push(row(date, root, NO_EPIC_SLUG, rollup(noEpicTasks(model, root))));
  return rows;
}
