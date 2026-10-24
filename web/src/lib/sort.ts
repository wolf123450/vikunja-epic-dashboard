import type { EpicDTO } from '../../../shared/api';
import { percent } from './format';

export type SortKey = 'status' | 'name' | 'activity' | 'created' | 'completed' | 'progress' | 'remaining' | 'points';
export type SortDir = 'asc' | 'desc';

/** Options in menu order. `dir` is the natural first direction (newest / largest first, names A-Z). */
export const SORT_OPTIONS: { key: SortKey; label: string; dir: SortDir }[] = [
  { key: 'status', label: 'Status', dir: 'asc' },
  { key: 'name', label: 'Name', dir: 'asc' },
  { key: 'activity', label: 'Last activity', dir: 'desc' },
  { key: 'created', label: 'Created', dir: 'desc' },
  { key: 'completed', label: 'Last completed', dir: 'desc' },
  { key: 'progress', label: 'Progress (pts %)', dir: 'desc' },
  { key: 'remaining', label: 'Points remaining', dir: 'desc' },
  { key: 'points', label: 'Total points', dir: 'desc' },
];

export const isSortKey = (v: unknown): v is SortKey => SORT_OPTIONS.some((o) => o.key === v);

const time = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null);

function value(e: EpicDTO, key: SortKey): string | number | null {
  const r = e.rollup;
  switch (key) {
    case 'status':
      return null; // server order
    case 'name':
      return e.name.toLowerCase();
    case 'activity':
      return time(e.lastActivityAt);
    case 'created':
      return time(e.createdAt);
    case 'completed':
      return time(r.lastCompletedAt);
    case 'progress':
      return r.pointsTotal > 0 ? percent(r.pointsDone, r.pointsTotal) : null;
    case 'remaining':
      return r.pointsTotal - r.pointsDone;
    case 'points':
      return r.pointsTotal;
  }
}

/**
 * Sorted copy. "Status" keeps the server's order (status, then points remaining). Missing values
 * sort last in either direction, ties keep server order, and No-epic rows always stay at the end.
 */
export function sortEpics(epics: readonly EpicDTO[], key: SortKey, dir: SortDir): EpicDTO[] {
  const sign = dir === 'asc' ? 1 : -1;
  return epics
    .map((e, i) => ({ e, i, v: value(e, key) }))
    .sort((a, b) => {
      if (a.e.isNoEpic !== b.e.isNoEpic) return a.e.isNoEpic ? 1 : -1;
      if (key === 'status') return sign * (a.i - b.i);
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      const c = typeof a.v === 'string' ? a.v.localeCompare(b.v as string) : a.v - (b.v as number);
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.e);
}
