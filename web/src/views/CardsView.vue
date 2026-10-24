<script setup lang="ts">
import { computed } from 'vue';
import { getEpics } from '../api';
import BucketBar from '../components/BucketBar.vue';
import EpicControls from '../components/EpicControls.vue';
import LoadState from '../components/LoadState.vue';
import { useEpicViewOptions } from '../composables/useEpicViewOptions';
import { useResource } from '../composables/useResource';
import { formatNumber, STATUS_LABELS } from '../lib/format';
import { sortEpics } from '../lib/sort';
import { apiIds, selectedIds } from '../store';

const { data, error, loading } = useResource(() => getEpics(apiIds.value), [() => apiIds.value?.join(',') ?? '']);
const options = useEpicViewOptions();
const epics = computed(() => (data.value ? sortEpics(data.value.epics, options.sort, options.dir) : []));
const multi = computed(() => selectedIds.value.length > 1);
</script>

<template>
  <h1 class="visually-hidden">
    Epic cards
  </h1>
  <LoadState
    :loading="loading"
    :error="error"
    :has-data="data !== null"
  >
    <template v-if="data">
      <EpicControls :buckets="data.buckets" />

      <p
        v-if="data.epics.length === 0"
        class="muted"
      >
        No epics in the selected projects.
      </p>
      <ul
        v-else
        class="grid"
      >
        <li
          v-for="e in epics"
          :key="e.key"
          class="card"
          :class="{ noepic: e.isNoEpic }"
        >
          <h2>
            <RouterLink
              class="cardlink"
              :to="{ name: 'epic', params: { key: e.key } }"
            >
              {{ e.name }}
            </RouterLink>
          </h2>
          <div class="meta">
            <span class="muted">{{ STATUS_LABELS[e.rollup.status] }}</span>
            <span
              v-if="multi"
              class="badge neutral"
            >{{ e.rootProjectTitle }}</span>
            <span
              v-if="e.rollup.unpointedOpen > 0"
              class="badge"
            >{{ e.rollup.unpointedOpen }} unpointed</span>
          </div>
          <p class="nums">
            {{ formatNumber(e.rollup.pointsDone) }} / {{ formatNumber(e.rollup.pointsTotal) }} pts &middot;
            {{ e.rollup.tasksDone }} / {{ e.rollup.tasksTotal }} tasks
          </p>
          <BucketBar
            :epic-key="e.key"
            :epic-name="e.name"
            :rollup="e.rollup"
            :buckets="data.buckets"
            :mode="options.mode"
          />
        </li>
      </ul>
    </template>
  </LoadState>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
.card {
  position: relative;
  padding: 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.card:hover {
  border-color: var(--accent);
}
.card h2 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  overflow-wrap: anywhere;
}
.cardlink::after {
  content: '';
  position: absolute;
  inset: 0;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  align-items: center;
  font-size: 0.8rem;
}
.nums {
  margin: 0.4rem 0 1rem;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
