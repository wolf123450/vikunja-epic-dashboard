import type { VikunjaClient } from './client.js';
import type { VikunjaView } from './schemas.js';

export type Bucket = { id: number; name: string; position: number };

export type Board = {
  projectId: number;
  viewId: number;
  /** Buckets in display order (Vikunja position, left to right). */
  buckets: Bucket[];
  /** 0 when the view has no done bucket configured. */
  doneBucketId: number;
  /** Task id -> bucket id. Tasks absent from the map aren't on this board. */
  taskBucket: Map<number, number>;
};

/** The configured Kanban view if given, else the project's first Kanban view by position. */
export function pickKanbanView(views: VikunjaView[], configuredViewId?: number): VikunjaView | null {
  const kanban = views.filter((v) => v.view_kind === 'kanban');
  if (configuredViewId !== undefined) {
    const v = kanban.find((k) => k.id === configuredViewId);
    if (!v) throw new Error(`KANBAN_VIEW_ID ${configuredViewId} is not a Kanban view of project ${views[0]?.project_id}`);
    return v;
  }
  return kanban.sort((a, b) => a.position - b.position)[0] ?? null;
}

/**
 * Bucket list and task->bucket membership for one project's Kanban view. Buckets whose
 * nested page already holds every task cost no extra request; larger ones are paged in.
 */
export async function fetchBoard(
  client: VikunjaClient,
  projectId: number,
  views: VikunjaView[],
  configuredViewId?: number,
): Promise<Board | null> {
  const view = pickKanbanView(views, configuredViewId);
  if (!view) return null;

  const raw = await client.kanbanBuckets(projectId, view.id);
  const taskBucket = new Map<number, number>();
  for (const b of raw) {
    const ids = b.tasks.length >= b.count ? b.tasks.map((t) => t.id) : await client.bucketTaskIds(projectId, view.id, b.id);
    for (const id of ids) taskBucket.set(id, b.id);
  }

  return {
    projectId,
    viewId: view.id,
    buckets: raw
      .map((b) => ({ id: b.id, name: b.title, position: b.position }))
      .sort((a, b) => a.position - b.position),
    doneBucketId: view.done_bucket_id,
    taskBucket,
  };
}
