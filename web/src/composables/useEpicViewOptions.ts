import { reactive, watch } from 'vue';
import type { SegmentMode } from '../lib/segments';
import { isSortKey, SORT_OPTIONS, type SortDir, type SortKey } from '../lib/sort';

const KEY = 'epic-dashboard-view';

type Options = { sort: SortKey; dir: SortDir; mode: SegmentMode };

function load(): Options {
  const fallback: Options = { sort: 'status', dir: 'asc', mode: 'tasks' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Options>;
    return {
      sort: isSortKey(raw.sort) ? raw.sort : fallback.sort,
      dir: raw.dir === 'desc' ? 'desc' : 'asc',
      mode: raw.mode === 'points' ? 'points' : 'tasks',
    };
  } catch {
    return fallback;
  }
}

// Shared by the list and cards screens, so switching screens or going Back keeps the choice.
const options = reactive<Options>(load());
watch(options, (o) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    // kept for this visit only
  }
});

/** Picking a new sort key starts in its natural direction; picking the same key again is a no-op. */
export function setSort(key: SortKey): void {
  if (key === options.sort) return;
  options.sort = key;
  options.dir = SORT_OPTIONS.find((o) => o.key === key)?.dir ?? 'asc';
}

export function useEpicViewOptions(): Options {
  return options;
}
