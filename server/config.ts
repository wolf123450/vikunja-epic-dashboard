import { z } from 'zod';

const csvInts = z
  .string()
  .transform((s) => s.split(',').map((p) => p.trim()).filter(Boolean))
  .pipe(z.array(z.coerce.number<string>().int().positive()));

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

// "12:34,15:40" -> Map(12 => 34, 15 => 40)
const kanbanViews = z
  .string()
  .transform((s, ctx) => {
    const out = new Map<number, number>();
    for (const pair of s.split(',').map((p) => p.trim()).filter(Boolean)) {
      const m = /^(\d+):(\d+)$/.exec(pair);
      if (!m) {
        ctx.addIssue({ code: 'custom', message: `expected projectId:viewId, got "${pair}"` });
        return z.NEVER;
      }
      out.set(Number(m[1]), Number(m[2]));
    }
    return out;
  });

// "Backlog:#9ca3af,In Review:#a855f7" -> Map(lowercased name => hex)
const bucketColors = z
  .string()
  .transform((s, ctx) => {
    const out = new Map<string, string>();
    for (const pair of s.split(',').map((p) => p.trim()).filter(Boolean)) {
      const idx = pair.lastIndexOf(':');
      const name = pair.slice(0, idx).trim();
      const hex = pair.slice(idx + 1).trim();
      if (idx <= 0 || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) {
        ctx.addIssue({ code: 'custom', message: `expected bucketName:#hex, got "${pair}"` });
        return z.NEVER;
      }
      out.set(name.toLowerCase(), hex);
    }
    return out;
  });

const envSchema = z.object({
  VIKUNJA_API_URL: z.url(),
  VIKUNJA_PUBLIC_URL: z.url().optional(),
  VIKUNJA_TOKEN: z.string().min(1),
  PROJECT_IDS: csvInts.optional(),
  INCLUDE_CHILD_PROJECTS: bool.default(true),
  POINTS_PREFIX: z.string().min(1).default('sp:'),
  POINTS_ALLOWED: csvInts.default([1, 2, 3, 5, 8, 13, 20, 40]),
  POINTS_SPLIT_THRESHOLD: z.coerce.number().positive().default(5),
  EPIC_MODE: z.enum(['label', 'parent', 'both']).default('both'),
  EPIC_PREFIX: z.string().min(1).default('epic:'),
  EPIC_MARKER_LABEL: z.string().min(1).default('epic'),
  SYNC_INTERVAL_SEC: z.coerce.number().int().min(10).default(300),
  SNAPSHOT_TIME: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM')
    .default('03:00'),
  TZ: z.string().default('America/Los_Angeles'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATA_DIR: z.string().default('/data'),
  KANBAN_VIEW_ID: kanbanViews.optional(),
  BUCKET_COLORS: bucketColors.optional(),
});

export type Config = ReturnType<typeof loadConfig>;

/** Parse and validate env vars. Throws with every invalid variable named. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  // Treat empty strings as unset so `FOO=` in a .env falls back to the default.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const c = result.data;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: c.TZ });
  } catch {
    throw new Error(`Invalid configuration:\n  TZ: unknown time zone "${c.TZ}"`);
  }
  const strip = (u: string) => u.replace(/\/+$/, '');
  return {
    vikunjaApiUrl: strip(c.VIKUNJA_API_URL),
    vikunjaPublicUrl: strip(c.VIKUNJA_PUBLIC_URL ?? c.VIKUNJA_API_URL),
    vikunjaToken: c.VIKUNJA_TOKEN,
    projectIds: c.PROJECT_IDS ?? null,
    includeChildProjects: c.INCLUDE_CHILD_PROJECTS,
    pointsPrefix: c.POINTS_PREFIX.toLowerCase(),
    pointsAllowed: new Set(c.POINTS_ALLOWED),
    pointsSplitThreshold: c.POINTS_SPLIT_THRESHOLD,
    epicMode: c.EPIC_MODE,
    epicPrefix: c.EPIC_PREFIX.toLowerCase(),
    epicMarkerLabel: c.EPIC_MARKER_LABEL.toLowerCase(),
    syncIntervalSec: c.SYNC_INTERVAL_SEC,
    snapshotTime: c.SNAPSHOT_TIME,
    tz: c.TZ,
    port: c.PORT,
    dataDir: c.DATA_DIR,
    kanbanViewIds: c.KANBAN_VIEW_ID ?? new Map<number, number>(),
    bucketColors: c.BUCKET_COLORS ?? new Map<string, string>(),
  };
}
