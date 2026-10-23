<script setup lang="ts">
import { computed, ref } from 'vue';
import { getEpics } from '../api';
import BucketBar from '../components/BucketBar.vue';
import LoadState from '../components/LoadState.vue';
import { useResource } from '../composables/useResource';
import { formatNumber, STATUS_LABELS } from '../lib/format';
import type { SegmentMode } from '../lib/segments';
import { NO_BUCKET_NAME } from '../lib/segments';
import { UNBUCKETED_COLOR } from '../../../shared/palette';
import { apiIds, selectedIds } from '../store';

const { data, error, loading } = useResource(() => getEpics(apiIds.value), [() => apiIds.value?.join(',') ?? '']);
const mode = ref<SegmentMode>('tasks');
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
      <div class="controls">
        <ul
          class="legend"
          aria-label="Bucket legend"
        >
          <li
            v-for="b in data.buckets"
            :key="b.key"
          >
            <span
              class="swatch"
              :style="{ background: b.color }"
            />{{ b.name }}
          </li>
          <li>
            <span
              class="swatch"
              :style="{ background: UNBUCKETED_COLOR }"
            />{{ NO_BUCKET_NAME }}
          </li>
        </ul>
        <div
          class="seg-toggle"
          role="group"
          aria-label="Segment width"
        >
          <span class="muted">Width by</span>
          <button
            type="button"
            :aria-pressed="mode === 'tasks'"
            @click="mode = 'tasks'"
          >
            Tickets
          </button>
          <button
            type="button"
            :aria-pressed="mode === 'points'"
            @click="mode = 'points'"
          >
            Points
          </button>
        </div>
      </div>

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
          v-for="e in data.epics"
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
            :mode="mode"
          />
        </li>
      </ul>
    </template>
  </LoadState>
</template>

<style scoped>
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.85rem;
}
.swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  margin-right: 0.35rem;
  border-radius: 2px;
  vertical-align: -1px;
}
.seg-toggle {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
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
