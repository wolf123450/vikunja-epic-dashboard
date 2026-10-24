<script setup lang="ts">
import { computed } from 'vue';
import type { EpicDTO } from '../../../shared/api';
import { getEpics } from '../api';
import BucketBar from '../components/BucketBar.vue';
import EpicControls from '../components/EpicControls.vue';
import LoadState from '../components/LoadState.vue';
import VelocitySparkline from '../components/VelocitySparkline.vue';
import { useEpicViewOptions } from '../composables/useEpicViewOptions';
import { useResource } from '../composables/useResource';
import { formatDate, formatNumber, percent, STATUS_LABELS } from '../lib/format';
import { sortEpics } from '../lib/sort';
import { apiIds, selectedIds } from '../store';

const { data, error, loading } = useResource(() => getEpics(apiIds.value), [() => apiIds.value?.join(',') ?? '']);
const options = useEpicViewOptions();
// The row's date follows the sort when sorting by a date, else shows last completed.
const rowDate = (e: EpicDTO): string | null =>
  options.sort === 'activity' ? e.lastActivityAt : options.sort === 'created' ? e.createdAt : e.rollup.lastCompletedAt;
const dateTitle = computed(() =>
  options.sort === 'activity' ? 'Last activity' : options.sort === 'created' ? 'Created' : 'Last completed',
);
const epics = computed(() => (data.value ? sortEpics(data.value.epics, options.sort, options.dir) : []));
const multi = computed(() => selectedIds.value.length > 1);
</script>

<template>
  <h1 class="visually-hidden">
    Epic overview
  </h1>
  <LoadState
    :loading="loading"
    :error="error"
    :has-data="data !== null"
  >
    <template v-if="data">
      <section
        class="totals"
        aria-label="Project totals"
      >
        <div class="stat">
          <span class="num">{{ formatNumber(data.totals.pointsDone) }} / {{ formatNumber(data.totals.pointsTotal) }}</span>
          <span class="muted">pts done ({{ Math.round(percent(data.totals.pointsDone, data.totals.pointsTotal)) }}%)</span>
        </div>
        <div class="stat">
          <span class="num">{{ data.totals.tasksDone }} / {{ data.totals.tasksTotal }}</span>
          <span class="muted">tasks done</span>
        </div>
        <div class="stat">
          <span class="num">{{ data.totals.unpointedOpen }}</span>
          <span class="muted">unpointed open</span>
        </div>
        <div class="stat">
          <span class="num">{{ formatDate(data.totals.lastCompletedAt) }}</span>
          <span class="muted">last completed</span>
        </div>
        <VelocitySparkline :weeks="data.velocity" />
      </section>

      <EpicControls :buckets="data.buckets" />

      <p
        v-if="data.epics.length === 0"
        class="muted"
      >
        No epics in the selected projects.
      </p>
      <ul
        v-else
        class="list"
      >
        <li
          v-for="e in epics"
          :key="e.key"
          class="row"
          :class="{ noepic: e.isNoEpic }"
        >
          <div class="name">
            <RouterLink :to="{ name: 'epic', params: { key: e.key } }">
              {{ e.name }}
            </RouterLink>
            <span
              v-if="multi"
              class="badge neutral"
            >{{ e.rootProjectTitle }}</span>
            <span class="muted status">{{ STATUS_LABELS[e.rollup.status] }}</span>
          </div>
          <BucketBar
            class="bars"
            :epic-key="e.key"
            :epic-name="e.name"
            :rollup="e.rollup"
            :buckets="data.buckets"
            :mode="options.mode"
          />
          <div class="nums">
            <span>{{ formatNumber(e.rollup.pointsDone) }} / {{ formatNumber(e.rollup.pointsTotal) }} pts</span>
            <span>{{ e.rollup.tasksDone }} / {{ e.rollup.tasksTotal }} tasks</span>
          </div>
          <div class="extra">
            <span
              v-if="e.rollup.unpointedOpen > 0"
              class="badge"
              :title="`${e.rollup.unpointedOpen} open tasks have no points`"
            >
              {{ e.rollup.unpointedOpen }} unpointed
            </span>
            <span
              class="muted last"
              :title="dateTitle"
            >{{ formatDate(rowDate(e)) }}</span>
          </div>
        </li>
      </ul>
    </template>
  </LoadState>
</template>

<style scoped>
.totals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2rem;
  align-items: flex-end;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.stat {
  display: flex;
  flex-direction: column;
}
.num {
  font-size: 1.15rem;
  font-weight: 600;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.row {
  display: grid;
  grid-template-columns: minmax(10rem, 2.2fr) minmax(8rem, 2fr) 9.5rem 10rem;
  gap: 0.5rem 1rem;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.row:last-child {
  border-bottom: 0;
}
.row.noepic {
  background: var(--surface);
  font-style: italic;
}
.name {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.5rem;
  align-items: baseline;
  min-width: 0;
  overflow-wrap: anywhere;
}
.status {
  font-size: 0.75rem;
}
.nums {
  display: flex;
  flex-direction: column;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}
.extra {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
}
@media (max-width: 700px) {
  .row {
    grid-template-columns: 1fr 1fr;
  }
  .name,
  .bars {
    grid-column: 1 / -1;
  }
}
</style>
