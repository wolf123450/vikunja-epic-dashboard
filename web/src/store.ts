import { computed, reactive, readonly } from 'vue';
import type { ProjectsResponse, SyncStatus } from '../../shared/api';
import { getProjects, postRefresh } from './api';
import { parseProjectIds } from './lib/query';
import { router } from './router';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'epic-dashboard-theme';

const state = reactive({
  theme: 'dark' as Theme,
  sync: null as SyncStatus | null,
  projects: null as ProjectsResponse | null,
  projectsError: null as string | null,
  /** Bumped by the refresh button; views reload when it changes. */
  refreshTick: 0,
  refreshing: false,
  refreshError: null as string | null,
});

export const store = readonly(state);

export function initTheme(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    // storage blocked: stay on the dark default
  }
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function applyTheme(theme: Theme): void {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
}

export function toggleTheme(): void {
  const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // not remembered; still applied
  }
}

export function setSync(sync: SyncStatus): void {
  state.sync = sync;
}

export async function loadProjects(): Promise<void> {
  try {
    const res = await getProjects();
    state.projects = res;
    state.projectsError = null;
    state.sync = res.sync;
  } catch (e) {
    state.projectsError = e instanceof Error ? e.message : String(e);
  }
}

/** Explicit selection from the URL, or the server default. */
export const selectedIds = computed<number[]>(
  () => parseProjectIds(router.currentRoute.value.query.projects) ?? state.projects?.defaultSelection ?? [],
);

/** Selection to send to the API: null lets the server apply its default. */
export const apiIds = computed<number[] | null>(() => parseProjectIds(router.currentRoute.value.query.projects));

export async function refresh(): Promise<void> {
  if (state.refreshing) return;
  state.refreshing = true;
  state.refreshError = null;
  try {
    state.sync = await postRefresh();
  } catch (e) {
    state.refreshError = e instanceof Error ? e.message : String(e);
  } finally {
    state.refreshing = false;
    state.refreshTick++;
    void loadProjects();
  }
}
