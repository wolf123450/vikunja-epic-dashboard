/**
 * Scrubs recorded Vikunja responses before they're committed as fixtures: task and project
 * titles, descriptions, identifiers, user details, and hostnames/IPs are replaced with
 * placeholders. Ids, dates, done flags, relations, buckets, and convention labels (sp:, epic:)
 * are kept, since tests depend on them.
 */
export type ScrubOptions = {
  /** Hostnames (with optional port) to replace, e.g. from VIKUNJA_API_URL. */
  hosts: string[];
  /** Label titles starting with these prefixes (case-insensitive) are kept verbatim. */
  keepLabelPrefixes: string[];
  /** Label titles equal to these (case-insensitive) are kept verbatim. */
  keepLabels: string[];
};

const PLACEHOLDER_HOST = 'vikunja.example';
const PRIVATE_IP = /\b(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))(\.\d{1,3}){2,3}(:\d+)?\b/g;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const isUser = (o: Obj) => 'username' in o;
const isTask = (o: Obj) => 'index' in o && 'project_id' in o && 'done' in o;
const isProject = (o: Obj) => 'parent_project_id' in o;
const isLabel = (o: Obj) => 'title' in o && Object.keys(o).every((k) => LABEL_KEYS.has(k));
const LABEL_KEYS = new Set(['id', 'title', 'description', 'hex_color', 'created_by', 'created', 'updated']);

export function scrub(value: unknown, opts: ScrubOptions): unknown {
  const keepPrefixes = opts.keepLabelPrefixes.map((p) => p.toLowerCase());
  const keepExact = new Set(opts.keepLabels.map((l) => l.toLowerCase()));

  const scrubString = (s: string) => {
    let out = s;
    for (const h of opts.hosts) out = out.split(h).join(PLACEHOLDER_HOST);
    return out.replace(PRIVATE_IP, PLACEHOLDER_HOST);
  };

  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return scrubString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (!isObj(v)) return v;

    if (isUser(v)) {
      const id = Number(v.id ?? 0);
      return { id, name: '', username: `user${id}`, created: v.created, updated: v.updated };
    }

    const out: Obj = {};
    for (const [k, child] of Object.entries(v)) out[k] = walk(child);

    if ('description' in out) out.description = '';
    if (isTask(v)) {
      out.title = `Task ${String(v.id)}`;
      out.identifier = `P${String(v.project_id)}-${String(v.index)}`;
    } else if (isProject(v)) {
      out.title = `Project ${String(v.id)}`;
      out.identifier = `P${String(v.id)}`;
      if ('background_blur_hash' in out) out.background_blur_hash = '';
    } else if (isLabel(v) && typeof v.title === 'string') {
      const t = v.title.trim().toLowerCase();
      const keep = keepExact.has(t) || keepPrefixes.some((p) => t.startsWith(p));
      if (!keep) out.title = `label-${String(v.id)}`;
    }
    return out;
  };

  return walk(value);
}
