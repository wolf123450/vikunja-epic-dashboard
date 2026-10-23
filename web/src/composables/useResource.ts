import { onScopeDispose, ref, shallowRef, watch, type WatchSource } from 'vue';
import type { SyncStatus } from '../../../shared/api';
import { ApiError } from '../api-error';
import { setSync, store } from '../store';

/** Loads `fetcher` now and whenever a dependency (or the global refresh tick) changes. */
export function useResource<T extends { sync: SyncStatus }>(fetcher: () => Promise<T>, deps: WatchSource[] = []) {
  const data = shallowRef<T | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(true);
  let token = 0;
  let disposed = false;
  onScopeDispose(() => (disposed = true));

  async function load(): Promise<void> {
    const mine = ++token;
    loading.value = true;
    try {
      const res = await fetcher();
      if (mine !== token || disposed) return;
      data.value = res;
      error.value = null;
      setSync(res.sync);
    } catch (e) {
      if (mine !== token || disposed) return;
      error.value = e instanceof Error ? e.message : String(e);
      if (e instanceof ApiError && e.sync) setSync(e.sync);
    } finally {
      if (mine === token) loading.value = false;
    }
  }

  watch([() => store.refreshTick, ...deps], load, { immediate: true });
  return { data, error, loading, reload: load };
}
