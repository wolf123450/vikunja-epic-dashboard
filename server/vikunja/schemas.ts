import { z } from 'zod';

// Shapes confirmed against Vikunja v2.7.0's /api/v1/docs.json. Only fields the dashboard
// uses are declared; zod strips the rest, so unrelated API additions don't break us.

/** Vikunja serializes unset dates as null or as Go's zero time; both become null. */
const nullableDate = z
  .string()
  .nullable()
  .optional()
  .transform((s, ctx) => {
    if (!s || s.startsWith('0001-01-01')) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: `invalid date "${s}"` });
      return z.NEVER;
    }
    return d;
  });

const requiredDate = nullableDate.refine((d): d is Date => d !== null, 'expected a date');

export const labelSchema = z.object({
  id: z.number().int(),
  title: z.string(),
});

/** A task as it appears inside another task's related_tasks map. */
const relatedTaskSchema = z.object({
  id: z.number().int(),
  project_id: z.number().int(),
});

export const taskSchema = z.object({
  id: z.number().int(),
  identifier: z.string(),
  index: z.number().int(),
  title: z.string(),
  project_id: z.number().int(),
  done: z.boolean(),
  done_at: nullableDate,
  created: requiredDate,
  updated: requiredDate,
  bucket_id: z.number().int().optional(),
  labels: z.array(labelSchema).nullable().optional().transform((v) => v ?? []),
  related_tasks: z
    .record(z.string(), z.array(relatedTaskSchema).nullable())
    .nullable()
    .optional()
    .transform((v) => v ?? {}),
});

export const viewSchema = z.object({
  id: z.number().int(),
  project_id: z.number().int(),
  title: z.string(),
  view_kind: z.enum(['list', 'gantt', 'table', 'kanban']),
  position: z.number(),
  done_bucket_id: z.number().int(),
  default_bucket_id: z.number().int(),
});

export const projectSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  identifier: z.string(),
  parent_project_id: z.number().int(),
  is_archived: z.boolean(),
  position: z.number(),
  views: z.array(viewSchema).nullable().optional().transform((v) => v ?? []),
});

/**
 * A bucket as returned by GET /projects/{id}/views/{kanbanView}/tasks. Despite the OpenAPI
 * spec saying Task[], Kanban views return buckets, each with at most one page of its tasks
 * nested and `count` giving the bucket's full size. Only task ids are needed from them.
 */
export const kanbanBucketSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  position: z.number(),
  project_view_id: z.number().int(),
  count: z.number().int(),
  tasks: z
    .array(z.object({ id: z.number().int() }))
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});

export const taskIdSchema = z.object({ id: z.number().int() });

export const infoSchema = z.object({
  version: z.string(),
  max_items_per_page: z.number().int().positive(),
});

export type VikunjaLabel = z.output<typeof labelSchema>;
export type VikunjaTask = z.output<typeof taskSchema>;
export type VikunjaView = z.output<typeof viewSchema>;
export type VikunjaProject = z.output<typeof projectSchema>;
export type VikunjaKanbanBucket = z.output<typeof kanbanBucketSchema>;
export type VikunjaInfo = z.output<typeof infoSchema>;
