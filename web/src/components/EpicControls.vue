<script setup lang="ts">
import type { BucketDTO } from '../../../shared/api';
import { UNBUCKETED_COLOR } from '../../../shared/palette';
import { setSort, useEpicViewOptions } from '../composables/useEpicViewOptions';
import { NO_BUCKET_NAME } from '../lib/segments';
import { isSortKey, SORT_OPTIONS } from '../lib/sort';

defineProps<{ buckets: BucketDTO[] }>();
const options = useEpicViewOptions();

function onSort(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  if (isSortKey(v)) setSort(v);
}
</script>

<template>
  <div class="controls">
    <ul
      class="legend"
      aria-label="Bucket legend"
    >
      <li
        v-for="b in buckets"
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
    <div class="right">
      <label class="sort">
        <span class="muted">Sort</span>
        <select
          :value="options.sort"
          @change="onSort"
        >
          <option
            v-for="o in SORT_OPTIONS"
            :key="o.key"
            :value="o.key"
          >{{ o.label }}</option>
        </select>
        <button
          type="button"
          class="dir"
          :aria-label="options.dir === 'asc' ? 'Ascending; switch to descending' : 'Descending; switch to ascending'"
          :title="options.dir === 'asc' ? 'Ascending' : 'Descending'"
          @click="options.dir = options.dir === 'asc' ? 'desc' : 'asc'"
        >{{ options.dir === 'asc' ? '↑' : '↓' }}</button>
      </label>
      <div
        class="seg-toggle"
        role="group"
        aria-label="Segment width"
      >
        <span class="muted">Width by</span>
        <button
          type="button"
          :aria-pressed="options.mode === 'tasks'"
          @click="options.mode = 'tasks'"
        >
          Tickets
        </button>
        <button
          type="button"
          :aria-pressed="options.mode === 'points'"
          @click="options.mode = 'points'"
        >
          Points
        </button>
      </div>
    </div>
  </div>
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
.right {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  align-items: center;
}
.sort,
.seg-toggle {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.dir {
  min-width: 2rem;
}
</style>
