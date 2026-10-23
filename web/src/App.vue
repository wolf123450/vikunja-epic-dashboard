<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import ErrorBanner from './components/ErrorBanner.vue';
import { loadProjects, store } from './store';

onMounted(() => void loadProjects());
</script>

<template>
  <AppHeader />
  <main>
    <ErrorBanner
      v-if="store.sync?.error"
      title="Last sync failed"
      :message="`${store.sync.error} Data shown may be out of date.`"
    />
    <ErrorBanner
      v-if="store.projectsError"
      title="Could not load projects"
      :message="store.projectsError"
    />
    <ErrorBanner
      v-if="store.refreshError"
      title="Refresh failed"
      :message="store.refreshError"
    />
    <RouterView />
  </main>
</template>

<style>
/* Dark is the default theme; light is opt-in via data-theme="light". All colours are custom properties. */
:root {
  color-scheme: dark;
  --bg: #0f1115;
  --surface: #171a21;
  --surface-2: #1f232c;
  --border: #2a2f3a;
  --text: #e6e8ec;
  --text-muted: #9aa3b2;
  --accent: #6ea8fe;
  --on-accent: #0b1220;
  --success: #3fb950;
  --warn: #d29922;
  --danger: #f85149;
  --danger-bg: #3a1618;
  --track: #2a2f3a;
  --shadow: rgba(0, 0, 0, 0.5);
  --focus: #ffd33d;
  font-family: system-ui, sans-serif;
  font-size: 15px;
}
:root[data-theme='light'] {
  color-scheme: light;
  --bg: #ffffff;
  --surface: #f6f7f9;
  --surface-2: #eceef2;
  --border: #d9dde3;
  --text: #1b1f24;
  --text-muted: #5b6472;
  --accent: #2563eb;
  --on-accent: #ffffff;
  --success: #1a7f37;
  --warn: #9a6700;
  --danger: #cf222e;
  --danger-bg: #ffebe9;
  --track: #dfe3e9;
  --shadow: rgba(0, 0, 0, 0.2);
  --focus: #0969da;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
html,
body {
  overflow-x: hidden;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  line-height: 1.4;
}
main {
  max-width: 76rem;
  margin: 0 auto;
  padding: 1rem;
}
h1 {
  font-size: 1.25rem;
  margin: 0 0 0.75rem;
}
h2 {
  font-size: 1rem;
  margin: 1rem 0 0.5rem;
}
a {
  color: var(--accent);
}
button,
select,
input[type='search'] {
  font: inherit;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.25rem 0.6rem;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
button[aria-pressed='true'],
button.on {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}
:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.muted {
  color: var(--text-muted);
}
.badge {
  display: inline-block;
  padding: 0 0.4rem;
  border-radius: 999px;
  font-size: 0.75rem;
  border: 1px solid var(--warn);
  color: var(--warn);
  white-space: nowrap;
}
.badge.neutral {
  border-color: var(--border);
  color: var(--text-muted);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
