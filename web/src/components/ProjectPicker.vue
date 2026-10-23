<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { buildPickerRows, selectionLabel } from '../lib/projects';
import { formatProjectIds, toggleId } from '../lib/query';
import { selectedIds, store } from '../store';

const route = useRoute();
const router = useRouter();
const open = ref(false);
const filter = ref('');
const root = ref<HTMLElement | null>(null);
const filterInput = ref<HTMLInputElement | null>(null);

const projects = computed(() => store.projects?.projects ?? []);
const rows = computed(() => buildPickerRows(projects.value, filter.value));
const label = computed(() => selectionLabel(projects.value, selectedIds.value));
const hasExplicit = computed(() => route.query.projects !== undefined);

function select(ids: number[]): void {
  const query = { ...route.query };
  if (ids.length === 0) return;
  query.projects = formatProjectIds(ids);
  void router.push({ path: route.path, query });
}

function toggle(id: number): void {
  select(toggleId(selectedIds.value, id));
}

function reset(): void {
  const query = { ...route.query };
  delete query.projects;
  void router.push({ path: route.path, query });
}

async function toggleOpen(): Promise<void> {
  open.value = !open.value;
  if (open.value) {
    filter.value = '';
    await nextTick();
    filterInput.value?.focus();
  }
}

function onDocClick(e: MouseEvent): void {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) open.value = false;
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div
    ref="root"
    class="picker"
  >
    <button
      type="button"
      class="trigger"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <span class="muted">Projects:</span> <span class="sel">{{ store.projects ? label : 'Loading...' }}</span>
      <span aria-hidden="true">&#9662;</span>
    </button>
    <div
      v-if="open"
      class="menu"
      role="group"
      aria-label="Project selection"
    >
      <input
        ref="filterInput"
        v-model="filter"
        type="search"
        class="filter"
        placeholder="Type to filter projects"
        aria-label="Filter projects"
      >
      <ul>
        <li
          v-for="row in rows"
          :key="row.project.id"
          :style="{ paddingLeft: 0.5 + row.depth * 1.1 + 'rem' }"
        >
          <label>
            <input
              type="checkbox"
              :checked="selectedIds.includes(row.project.id)"
              @change="toggle(row.project.id)"
            >
            <span class="title">{{ row.project.title }}</span>
            <span class="muted count">{{ row.project.epicCount }} epics</span>
          </label>
          <button
            type="button"
            class="only"
            @click="select([row.project.id])"
          >
            only
          </button>
        </li>
        <li
          v-if="rows.length === 0"
          class="muted empty"
        >
          No matching projects
        </li>
      </ul>
      <div class="foot">
        <button
          type="button"
          :disabled="!hasExplicit"
          @click="reset"
        >
          Use default selection
        </button>
        <button
          type="button"
          @click="open = false"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
  min-width: 0;
}
.trigger {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  max-width: 100%;
}
.sel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 14rem;
}
.muted {
  color: var(--text-muted);
}
.menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  width: min(22rem, calc(100vw - 2rem));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 6px 20px var(--shadow);
  padding: 0.5rem;
}
.filter {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.4rem;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 16rem;
  overflow-y: auto;
}
li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-top: 0.15rem;
  padding-bottom: 0.15rem;
}
li label {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  font-size: 0.75rem;
  white-space: nowrap;
}
.only {
  font-size: 0.75rem;
  padding: 0.05rem 0.4rem;
}
.empty {
  padding: 0.5rem;
}
.foot {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
}
</style>
