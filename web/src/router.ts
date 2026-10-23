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

// Carry the project selection across navigation between screens.
router.beforeEach((to, from) => {
  if (to.path === from.path || to.query.projects !== undefined) return true;
  const ids = parseProjectIds(from.query.projects);
  if (!ids) return true;
  return { ...to, query: { ...to.query, projects: formatProjectIds(ids) }, replace: true };
});
