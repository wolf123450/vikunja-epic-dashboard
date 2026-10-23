import { z } from 'zod';
import {
  infoSchema,
  kanbanBucketSchema,
  labelSchema,
  projectSchema,
  taskIdSchema,
  taskSchema,
  viewSchema,
  type VikunjaInfo,
} from './schemas.js';

export class VikunjaHttpError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    detail: string,
  ) {
    const hint =
      status === 401 || status === 403
        ? ' (token rejected: it may be revoked, expired, or missing a read scope)'
        : '';
    super(`Vikunja ${endpoint} returned HTTP ${status}${hint}: ${detail}`);
    this.name = 'VikunjaHttpError';
  }
}

/** The API returned data that doesn't match the expected shape (API drift). */
export class VikunjaSchemaError extends Error {
  constructor(
    readonly endpoint: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    const lines = issues.slice(0, 10).map((i) => `  ${formatPath(i.path)}: ${i.message}`);
    const more = issues.length > 10 ? `\n  ...and ${issues.length - 10} more` : '';
    super(`Vikunja ${endpoint} response failed validation:\n${lines.join('\n')}${more}`);
    this.name = 'VikunjaSchemaError';
  }
}

function formatPath(path: PropertyKey[]): string {
  if (path.length === 0) return '(root)';
  return path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
    .join('');
}

export type ClientOptions = {
  /** Vikunja base URL, with or without the trailing /api/v1. */
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  /** Hard stop for runaway pagination. */
  maxPages?: number;
  /** Per-request timeout in ms, covering headers and body. Default 30 000. */
  timeoutMs?: number;
};

type Query = Record<string, string | number | boolean | undefined>;

export class VikunjaClient {
  private readonly apiBase: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;
  private readonly maxPages: number;
  private readonly timeoutMs: number;
  private perPage = 50;

  constructor(opts: ClientOptions) {
    const base = opts.baseUrl.replace(/\/+$/, '');
    this.apiBase = base.endsWith('/api/v1') ? base : `${base}/api/v1`;
    this.token = opts.token;
    this.fetchFn = opts.fetch ?? fetch;
    this.maxPages = opts.maxPages ?? 1000;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /** Fetch server info and adopt its page-size limit. Call once before paginated reads. */
  async info(): Promise<VikunjaInfo> {
    const { data } = await this.request('/info', infoSchema);
    this.perPage = data.max_items_per_page;
    return data;
  }

  /** Real projects only: Vikunja also lists pseudo-projects (e.g. Favorites) with negative ids. */
  async projects(opts: { includeArchived?: boolean } = {}) {
    const all = await this.getAll('/projects', projectSchema, { is_archived: opts.includeArchived });
    return all.filter((p) => p.id > 0);
  }

  async views(projectId: number) {
    return (await this.request(`/projects/${projectId}/views`, z.array(viewSchema))).data;
  }

  /**
   * Buckets of a Kanban view, with up to one page of task ids nested in each. Read from the
   * view's task listing rather than GET .../buckets, which needs an extra token scope.
   */
  async kanbanBuckets(projectId: number, viewId: number) {
    const path = `/projects/${projectId}/views/${viewId}/tasks`;
    return (await this.request(path, z.array(kanbanBucketSchema), { per_page: this.perPage })).data;
  }

  /** Every task id in one Kanban bucket, paginated. */
  async bucketTaskIds(projectId: number, viewId: number, bucketId: number): Promise<number[]> {
    const path = `/projects/${projectId}/views/${viewId}/tasks`;
    const tasks = await this.getAll(path, taskIdSchema, { filter: `bucket_id = ${bucketId}` });
    return tasks.map((t) => t.id);
  }

  /** Tasks across every project the token can read. `filter` uses Vikunja's filter syntax. */
  tasks(opts: { filter?: string } = {}) {
    return this.getAll('/tasks', taskSchema, { filter: opts.filter });
  }

  labels() {
    return this.getAll('/labels', labelSchema);
  }

  /** GET every page of a list endpoint. */
  async getAll<S extends z.ZodType>(path: string, itemSchema: S, query: Query = {}): Promise<z.output<S>[]> {
    const out: z.output<S>[] = [];
    const listSchema = z.array(itemSchema);
    for (let page = 1; page <= this.maxPages; page++) {
      const { data, headers } = await this.request(path, listSchema, { ...query, page, per_page: this.perPage });
      out.push(...data);
      const totalPages = Number(headers.get('x-pagination-total-pages'));
      if (Number.isFinite(totalPages) && totalPages > 0) {
        if (page >= totalPages) return out;
      } else if (data.length < this.perPage) {
        // No pagination header: a short page means we've reached the end.
        return out;
      }
      if (data.length === 0) return out;
    }
    throw new Error(`Vikunja ${path}: gave up after ${this.maxPages} pages`);
  }

  private async request<S extends z.ZodType>(
    path: string,
    schema: S,
    query: Query = {},
  ): Promise<{ data: z.output<S>; headers: Headers }> {
    const url = new URL(this.apiBase + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    const endpoint = `GET ${path}`;

    const signal = AbortSignal.timeout(this.timeoutMs);
    const timedOut = () => new Error(`Vikunja ${endpoint}: timed out after ${this.timeoutMs / 1000}s`);
    const isTimeout = (err: unknown) => signal.aborted || (err as Error)?.name === 'TimeoutError';

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal,
      });
    } catch (err) {
      if (isTimeout(err)) throw timedOut();
      throw new Error(`Vikunja ${endpoint}: request failed: ${(err as Error).message}`, { cause: err });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new VikunjaHttpError(endpoint, res.status, body.slice(0, 200) || res.statusText);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      if (isTimeout(err)) throw timedOut();
      throw new Error(
        `Vikunja ${endpoint} returned HTTP ${res.status} but the body is not valid JSON (is the URL pointing at a proxy or login page?): ${(err as Error).message}`,
        { cause: err },
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new VikunjaSchemaError(endpoint, parsed.error.issues);
    return { data: parsed.data, headers: res.headers };
  }
}
