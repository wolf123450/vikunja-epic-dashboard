// Project selection lives in the `?projects=12,15` query. Missing = the server's defaultSelection.

type QueryValue = string | null | (string | null)[] | undefined;

/** Parse `?projects=` into unique positive integer ids. Returns null when absent or unusable. */
export function parseProjectIds(value: QueryValue): number[] | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const ids: number[] = [];
  for (const part of raw.split(',')) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && !ids.includes(n)) ids.push(n);
  }
  return ids.length > 0 ? ids : null;
}

export function formatProjectIds(ids: readonly number[]): string {
  return ids.join(',');
}

/** Query string for an API call; empty when the selection is the default. */
export function projectsQueryString(ids: readonly number[] | null): string {
  return ids && ids.length > 0 ? `?projects=${formatProjectIds(ids)}` : '';
}

export function firstString(value: QueryValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw !== '' ? raw : null;
}

/** Toggle an id in a selection, keeping a stable ascending order. */
export function toggleId(ids: readonly number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].sort((a, b) => a - b);
}
