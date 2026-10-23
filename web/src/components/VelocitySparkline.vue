<script setup lang="ts">
import { computed } from 'vue';
import type { WeekDTO } from '../../../shared/api';
import { sparklinePoints } from '../lib/format';

const props = defineProps<{ weeks: WeekDTO[] }>();
const W = 120;
const H = 28;
const points = computed(() => sparklinePoints(props.weeks.map((w) => w.points), W, H));
const total = computed(() => props.weeks.reduce((s, w) => s + w.points, 0));
const last = computed(() => props.weeks[props.weeks.length - 1]?.points ?? 0);
const summary = computed(
  () => `Weekly velocity, last ${props.weeks.length} weeks: ${total.value} points total, ${last.value} in the latest week`,
);
</script>

<template>
  <div
    class="spark"
    :title="summary"
  >
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      :width="W"
      :height="H"
      role="img"
      :aria-label="summary"
    >
      <polyline
        :points="points"
        fill="none"
        stroke="var(--accent)"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
    <span class="cap">velocity, {{ weeks.length }} wk · {{ last }} pts last week</span>
  </div>
</template>

<style scoped>
.spark {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
svg {
  display: block;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
}
.cap {
  font-size: 0.7rem;
  color: var(--text-muted);
}
</style>
