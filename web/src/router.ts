import { createRouter, createWebHistory } from 'vue-router';
import { parseProjectIds, formatProjectIds } from './lib/query';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'overview', component: () => import('./views/OverviewView.vue') },
    { path: '/cards', name: 'cards', component: () => import('./views/CardsView.vue') },
    { path: '/epics/:key(.*)', name: 'epic', component: () => import('./views/EpicDetailView.vue') },
    { path: '/hygiene', name: 'hygiene', component: () => import('./views/HygieneView.vue') },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});

const SELECTION_KEY = 'epic-dashboard-projects';

function savedSelection(): number[] | null {
  try {
    return parseProjectIds(localStorage.getItem(SELECTION_KEY));
  } catch {
    return null;
  }
}

function saveSelection(ids: number[] | null): void {
  try {
    if (ids) localStorage.setItem(SELECTION_KEY, formatProjectIds(ids));
    else localStorage.removeItem(SELECTION_KEY);
  } catch {
    // not remembered across visits; the URL still carries it
  }
}

// Carry the project selection across navigation between screens, and restore the last one on a
// fresh visit. Don't force `replace` here: that would overwrite the page being left, so Back
// would skip it and land on an older selection.
router.beforeEach((to, from) => {
  if (to.query.projects !== undefined) return true;
  const initial = from.matched.length === 0;
  if (!initial && to.path === from.path) return true;
  const ids = initial ? savedSelection() : parseProjectIds(from.query.projects);
  if (!ids) return true;
  return { ...to, query: { ...to.query, projects: formatProjectIds(ids) } };
});

router.afterEach((to, from, failure) => {
  if (failure) return;
  const ids = parseProjectIds(to.query.projects);
  if (ids) saveSelection(ids);
  // "Use default selection" drops the query on the same screen: forget the saved one too.
  else if (to.path === from.path && from.query.projects !== undefined) saveSelection(null);
});
