<script setup lang="ts">
import { computed } from 'vue';
import type { RollupDTO } from '../../../shared/api';
import { percent } from '../lib/format';

const props = defineProps<{ rollup: RollupDTO }>();
const pts = computed(() => percent(props.rollup.pointsDone, props.rollup.pointsTotal));
const tasks = computed(() => percent(props.rollup.tasksDone, props.rollup.tasksTotal));
</script>

<template>
  <div class="dual">
    <div
      class="track"
      role="progressbar"
      aria-label="Points done"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(pts)"
    >
      <div
        class="fill pts"
        :style="{ width: pts + '%' }"
      />
    </div>
    <div
      class="track thin"
      role="progressbar"
      aria-label="Tasks done"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(tasks)"
    >
      <div
        class="fill tasks"
        :style="{ width: tasks + '%' }"
      />
    </div>
  </div>
</template>

<style scoped>
.dual {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.track {
  height: 8px;
  background: var(--track);
  border-radius: 2px;
  overflow: hidden;
}
.track.thin {
  height: 4px;
}
.fill {
  height: 100%;
}
.fill.pts {
  background: var(--success);
}
.fill.tasks {
  background: var(--accent);
}
</style>
