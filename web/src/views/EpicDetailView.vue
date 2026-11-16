<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getEpicDetail } from '../api';
import BurnupChart from '../components/BurnupChart.vue';
import DualProgress from '../components/DualProgress.vue';
import LoadState from '../components/LoadState.vue';
import { useResource } from '../composables/useResource';
import type { BurnupMetric } from '../lib/burnup';
import { FLAG_LABELS, forecastText, formatDate, formatNumber, STATUS_LABELS } from '../lib/format';
import { firstString } from '../lib/query';
import { UNBUCKETED_COLOR } from '../../../shared/palette';
import {
  filterTasks,
  NO_BUCKET_FILTER,
  sortTasks,
  TASK_SORT_FIRST_DIR,
  type TaskFilters,
  type TaskSortDir,
  type TaskSortKey,
} from '../lib/tasks';
import { apiIds } from '../store';

const route = useRoute();
const router = useRouter();
const key = computed(() => String(route.params.key ?? ''));
const { data, error, loading } = useResource(() => getEpicDetail(key.value, apiIds.value), [
  key,
  () => apiIds.value?.join(',') ?? '',
]);

const metric = ref<BurnupMetric>('points');
const state = ref<TaskFilters['state']>('all');
const pointed = ref<TaskFilters['pointed']>('all');
const bucket = computed<string>({
  get: () => firstString(route.query.bucket) ?? '',
  set: (v) => {
    const query = { ...route.query };
    if (v === '') delete query.bucket;
    else query.bucket = v;
    void router.replace({ query });
  },
});

const bucketNames = computed(() => new Map((data.value?.buckets ?? []).map((b) => [b.key, b.name])));
const bucketColors = computed(() => new Map((data.value?.buckets ?? []).map((b) => [b.key, b.color])));
const bucketPositions = computed(() => new Map((data.value?.buckets ?? []).map((b) => [b.key, b.position])));
const bucketColor = (k: string | null): string => (k === null ? UNBUCKETED_COLOR : (bucketColors.value.get(k) ?? UNBUCKETED_COLOR));
const bucketOptions = computed(() => {
  const used = new Set((data.value?.tasks ?? []).map((t) => t.bucketKey));
  const opts = (data.value?.buckets ?? []).filter((b) => used.has(b.key) || b.key === bucket.value).map((b) => ({ value: b.key, label: b.name }));
  if (used.has(null) || bucket.value === NO_BUCKET_FILTER) opts.push({ value: NO_BUCKET_FILTER, label: 'Not on board' });
  return opts;
});
const bucketLabel = (k: string | null): string => (k === null ? 'Not on board' : (bucketNames.value.get(k) ?? k));

const filtered = computed(() =>
  filterTasks(data.value?.tasks ?? [], { bucket: bucket.value, state: state.value, pointed: pointed.value }),
);

// Column sort. null keeps the server order. Clicking a header cycles: natural direction,
// reversed, back to server order.
const sort = ref<{ key: TaskSortKey; dir: TaskSortDir } | null>(null);
const COLUMNS: { key: TaskSortKey; label: string; cls?: string }[] = [
  { key: 'ref', label: 'Ref' },
  { key: 'title', label: 'Title' },
  { key: 'bucket', label: 'Bucket' },
  { key: 'points', label: 'Pts', cls: 'r' },
  { key: 'state', label: 'State' },
  { key: 'doneAt', label: 'Done' },
  { key: 'flags', label: 'Flags' },
];
function toggleSort(key: TaskSortKey): void {
  const first = TASK_SORT_FIRST_DIR[key];
  const cur = sort.value;
  if (cur?.key !== key) sort.value = { key, dir: first };
  else if (cur.dir === first) sort.value = { key, dir: first === 'asc' ? 'desc' : 'asc' };
  else sort.value = null;
}
const ariaSort = (key: TaskSortKey): 'ascending' | 'descending' | 'none' =>
  sort.value?.key !== key ? 'none' : sort.value.dir === 'asc' ? 'ascending' : 'descending';
const rows = computed(() =>
  sort.value ? sortTasks(filtered.value, sort.value.key, sort.value.dir, bucketPositions.value) : filtered.value,
);
const forecast = computed(() => forecastText(data.value?.forecast ?? null));
const hasReconstructed = computed(() => (data.value?.burnup ?? []).some((p) => p.source === 'reconstructed'));
</script>

<template>
  <p class="back">
    <RouterLink :to="{ name: 'overview' }">
      &larr; All epics
    </RouterLink>
  </p>
  <LoadState
    :loading="loading"
    :error="error"
    :has-data="data !== null"
  >
    <template v-if="data">
      <header class="head">
        <h1>{{ data.epic.name }}</h1>
        <span class="muted">{{ STATUS_LABELS[data.epic.rollup.status] }} &middot; {{ data.epic.rootProjectTitle }}</span>
        <a
          v-if="data.epic.parentTask"
          :href="data.epic.parentTask.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          Epic task {{ data.epic.parentTask.ref }}
        </a>
      </header>
      <div class="summary">
        <DualProgress
          :rollup="data.epic.rollup"
          class="bars"
        />
        <span>{{ formatNumber(data.epic.rollup.pointsDone) }} / {{ formatNumber(data.epic.rollup.pointsTotal) }} pts</span>
        <span>{{ data.epic.rollup.tasksDone }} / {{ data.epic.rollup.tasksTotal }} tasks</span>
        <span
          v-if="data.epic.rollup.unpointedOpen > 0"
          class="badge"
        >{{ data.epic.rollup.unpointedOpen }} unpointed</span>
        <span class="muted">last completed {{ formatDate(data.epic.rollup.lastCompletedAt) }}</span>
      </div>

      <section v-if="!data.epic.isNoEpic">
        <div class="chart-head">
          <h2>Burn-up</h2>
          <div
            class="seg"
            role="group"
            aria-label="Burn-up unit"
          >
            <button
              type="button"
              :aria-pressed="metric === 'points'"
              @click="metric = 'points'"
            >
              Points
            </button>
            <button
              type="button"
              :aria-pressed="metric === 'tasks'"
              @click="metric = 'tasks'"
            >
              Tasks
            </button>
          </div>
        </div>
        <p
          v-if="data.burnup.length === 0"
          class="muted"
        >
          No history yet.
        </p>
        <template v-else>
          <BurnupChart
            :points="data.burnup"
            :metric="metric"
          />
          <p
            v-if="hasReconstructed"
            class="muted note"
          >
            The shaded period is approximate: it is reconstructed from task creation and completion dates.
          </p>
        </template>
        <p
          v-if="forecast"
          class="forecast"
        >
          {{ forecast }}
        </p>
      </section>

      <section>
        <h2>Tasks ({{ filtered.length }} of {{ data.tasks.length }})</h2>
        <div class="filters">
          <label>Bucket
            <select v-model="bucket">
              <option value="">All</option>
              <option
                v-for="o in bucketOptions"
                :key="o.value"
                :value="o.value"
              >{{ o.label }}</option>
            </select>
          </label>
          <label>State
            <select v-model="state">
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label>Points
            <select v-model="pointed">
              <option value="all">All</option>
              <option value="pointed">Pointed</option>
              <option value="unpointed">Unpointed</option>
            </select>
          </label>
        </div>
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th
                  v-for="c in COLUMNS"
                  :key="c.key"
                  :class="c.cls"
                  :aria-sort="ariaSort(c.key)"
                >
                  <button
                    type="button"
                    class="sorthead"
                    :title="`Sort by ${c.label}`"
                    @click="toggleSort(c.key)"
                  >
                    {{ c.label }}<span
                      class="arrow"
                      aria-hidden="true"
                    >{{ ariaSort(c.key) === 'ascending' ? '▲' : ariaSort(c.key) === 'descending' ? '▼' : '' }}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in rows"
                :key="t.id"
              >
                <td class="nowrap">
                  {{ t.ref }}
                </td>
                <td>
                  <a
                    :href="t.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ t.title }}</a>
                </td>
                <td>
                  <span
                    class="pill"
                    :style="{ '--pill': bucketColor(t.bucketKey) }"
                  >{{ bucketLabel(t.bucketKey) }}</span>
                </td>
                <td class="r">
                  {{ t.points ?? '-' }}
                </td>
                <td>
                  <span
                    class="pill"
                    :class="t.done ? 'state-done' : 'state-open'"
                  >{{ t.done ? 'Done' : 'Open' }}</span>
                </td>
                <td class="nowrap">
                  {{ formatDate(t.doneAt) }}
                </td>
                <td>
                  <span
                    v-for="f in t.flags"
                    :key="f.type"
                    class="badge"
                    :title="f.detail"
                  >{{ FLAG_LABELS[f.type] }}</span>
                </td>
              </tr>
              <tr v-if="filtered.length === 0">
                <td
                  colspan="7"
                  class="muted"
                >
                  No tasks match the filters.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </LoadState>
</template>

<style scoped>
.back {
  margin: 0 0 0.5rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  align-items: baseline;
}
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  align-items: center;
}
.bars {
  width: 14rem;
  max-width: 100%;
}
.chart-head {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.chart-head h2 {
  margin-right: auto;
}
.note {
  font-size: 0.8rem;
  margin: 0.25rem 0;
}
.forecast {
  font-weight: 600;
  margin: 0.25rem 0;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-bottom: 0.5rem;
}
.filters label {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.tablewrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 4px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
th,
td {
  padding: 0.3rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
th {
  background: var(--surface);
  color: var(--text-muted);
  font-weight: 600;
}
tr:last-child td {
  border-bottom: 0;
}
.r {
  text-align: right;
}
.nowrap {
  white-space: nowrap;
}
.badge {
  margin-right: 0.25rem;
}
th {
  padding: 0;
}
.sorthead {
  all: unset;
  box-sizing: border-box;
  display: flex;
  gap: 0.25rem;
  align-items: center;
  width: 100%;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  white-space: nowrap;
}
th.r .sorthead {
  justify-content: flex-end;
}
.sorthead:hover {
  color: var(--text);
}
.sorthead:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.arrow {
  font-size: 0.65rem;
  min-width: 0.65rem;
}
.pill {
  display: inline-block;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  white-space: nowrap;
  color: var(--text);
  border: 1px solid var(--pill);
  background: color-mix(in srgb, var(--pill) 22%, transparent);
}
.state-done {
  --pill: var(--success);
}
.state-open {
  --pill: var(--accent);
}
</style>
