// Domain -> wire DTO mapping. Dates become ISO strings; Task -> TaskDTO happens only here.

import type { BucketDTO, EpicDTO, RollupDTO, TaskDTO } from '../../shared/api.js';
import { bucketColor } from '../../shared/palette.js';
import type { Bucket, Epic, Model, Rollup, Task } from '../domain/types.js';

export const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function taskDTO(t: Task): TaskDTO {
  return {
    id: t.id,
    ref: t.ref,
    title: t.title,
    url: t.url,
    projectId: t.projectId,
    bucketKey: t.bucketKey,
    points: t.points,
    done: t.done,
    doneAt: iso(t.doneAt),
    flags: t.flags.map((f) => ({ type: f.type, detail: f.detail })),
  };
}

export function rollupDTO(r: Rollup): RollupDTO {
  return {
    pointsTotal: r.pointsTotal,
    pointsDone: r.pointsDone,
    tasksTotal: r.tasksTotal,
    tasksDone: r.tasksDone,
    unpointedOpen: r.unpointedOpen,
    status: r.status,
    lastCompletedAt: iso(r.lastCompletedAt),
    buckets: r.buckets.map((b) => ({ ...b })),
  };
}

export function epicDTO(
  model: Model,
  epic: Epic,
  rollup: Rollup,
  projectTitle: (id: number) => string,
): EpicDTO {
  const parent = epic.parentTaskId === undefined ? undefined : model.tasks.find((t) => t.id === epic.parentTaskId);
  return {
    key: epic.key,
    slug: epic.slug,
    name: epic.name,
    isNoEpic: false,
    source: epic.source,
    rootProjectId: epic.rootProjectId,
    rootProjectTitle: projectTitle(epic.rootProjectId),
    parentTask: parent ? { id: parent.id, ref: parent.ref, url: parent.url } : null,
    rollup: rollupDTO(rollup),
  };
}

export function noEpicDTO(
  rootProjectId: number,
  rollup: Rollup,
  projectTitle: (id: number) => string,
): EpicDTO {
  return {
    key: `${rootProjectId}:`,
    slug: '',
    name: 'No epic',
    isNoEpic: true,
    source: null,
    rootProjectId,
    rootProjectTitle: projectTitle(rootProjectId),
    parentTask: null,
    rollup: rollupDTO(rollup),
  };
}

/**
 * Union of the roots' buckets merged by key: first root's order, then new keys. Colours come
 * from the merged display index, so buckets from different roots never share a palette slot.
 */
export function mergedBuckets(
  model: Model,
  roots: number[],
  overrides: ReadonlyMap<string, string>,
): BucketDTO[] {
  const merged = new Map<string, Bucket>();
  const doneKeys = new Set<string>();
  for (const root of roots) {
    for (const b of model.buckets.get(root) ?? []) {
      if (!merged.has(b.key)) merged.set(b.key, b);
      if (b.isDone) doneKeys.add(b.key);
    }
  }
  return [...merged.values()].map((b, i) => {
    const isDone = doneKeys.has(b.key);
    return {
      key: b.key,
      name: b.name,
      position: i,
      color: bucketColor({ key: b.key, position: i, isDone }, overrides),
      isDone,
    };
  });
}
