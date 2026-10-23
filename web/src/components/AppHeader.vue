<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { relativeTime } from '../lib/format';
import { refresh, store, toggleTheme } from '../store';
import ProjectPicker from './ProjectPicker.vue';

const route = useRoute();
const isCards = computed(() => route.name === 'cards');
const isList = computed(() => route.name === 'overview' || route.name === 'epic');
const synced = computed(() => relativeTime(store.sync?.lastSuccessAt));
const syncTitle = computed(() => store.sync?.lastSuccessAt ?? 'No successful sync yet');
</script>

<template>
  <header class="top">
    <div class="row">
      <RouterLink
        class="brand"
        :to="{ name: 'overview' }"
      >
        Epic Dashboard
      </RouterLink>
      <ProjectPicker />
      <nav
        class="toggle"
        aria-label="View"
      >
        <RouterLink
          :to="{ name: 'overview' }"
          :class="{ active: isList }"
          :aria-current="isList ? 'page' : undefined"
        >
          List
        </RouterLink>
        <RouterLink
          :to="{ name: 'cards' }"
          :class="{ active: isCards }"
          :aria-current="isCards ? 'page' : undefined"
        >
          Cards
        </RouterLink>
      </nav>
      <RouterLink
        :to="{ name: 'hygiene' }"
        class="navlink"
        :class="{ active: route.name === 'hygiene' }"
      >
        Hygiene
      </RouterLink>
      <span class="grow" />
      <span
        class="sync"
        :title="syncTitle"
      >
        Synced {{ synced }}<span v-if="store.sync?.syncing"> (syncing...)</span>
      </span>
      <button
        type="button"
        :disabled="store.refreshing"
        @click="refresh"
      >
        {{ store.refreshing ? 'Refreshing...' : 'Refresh' }}
      </button>
      <button
        type="button"
        :aria-pressed="store.theme === 'light'"
        @click="toggleTheme"
      >
        {{ store.theme === 'dark' ? 'Light theme' : 'Dark theme' }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.top {
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  max-width: 76rem;
  margin: 0 auto;
  padding: 0.5rem 1rem;
}
.brand {
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
}
.grow {
  flex: 1;
}
.toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.toggle a {
  padding: 0.25rem 0.7rem;
  color: var(--text);
  text-decoration: none;
}
.toggle a.active {
  background: var(--accent);
  color: var(--on-accent);
}
.navlink.active {
  font-weight: 600;
}
.sync {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
