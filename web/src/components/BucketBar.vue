<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BucketDTO, RollupDTO } from '../../../shared/api';
import { shouldNavigateOnClick } from '../lib/tap';
import { computeSegments, segmentDescription, type SegmentMode } from '../lib/segments';

const props = defineProps<{
  epicKey: string;
  epicName: string;
  rollup: RollupDTO;
  buckets: BucketDTO[];
  mode: SegmentMode;
}>();

const bar = computed(() => computeSegments(props.rollup, props.buckets, props.mode));
const active = ref<string | null>(null); // segment id currently showing the tooltip
let lastPointer: string = 'mouse';

const segId = (key: string | null): string => key ?? '__none__';
const activeSegment = computed(() => bar.value.segments.find((s) => segId(s.bucketKey) === active.value) ?? null);
const tipAlign = computed(() => {
  const c = activeSegment.value?.centerPct ?? 50;
  return c < 22 ? 'left' : c > 78 ? 'right' : 'center';
});

// Emulated mouseenter/focus follow a tap; they must not pre-activate the tooltip,
// or the first tap would look like a second one.
let touching = false;
function show(id: string): void {
  if (!touching) active.value = id;
}
function onPointerDown(e: PointerEvent): void {
  lastPointer = e.pointerType;
  touching = e.pointerType === 'touch';
}
// On touch, the first tap shows the tooltip and a second tap on the same segment navigates.
function onClick(e: MouseEvent, id: string, navigate: (e?: MouseEvent) => unknown): void {
  // Keyboard Enter dispatches a click with detail 0; treat it as non-touch.
  const pointer = e.detail === 0 ? 'keyboard' : lastPointer;
  touching = false;
  if (shouldNavigateOnClick(pointer, active.value, id)) {
    navigate(e);
  } else {
    e.preventDefault();
    active.value = id;
  }
}
function onBlur(e: FocusEvent): void {
  const next = e.relatedTarget as Node | null;
  if (!next || !(e.currentTarget as HTMLElement).parentElement?.contains(next)) active.value = null;
}
</script>

<template>
  <div
    class="bucketbar"
    @mouseleave="active = null"
    @keydown.esc="active = null"
  >
    <div
      class="bar"
      :class="{ empty: bar.empty }"
    >
      <template v-if="!bar.empty">
        <RouterLink
          v-for="s in bar.segments"
          :key="segId(s.bucketKey)"
          v-slot="{ href, navigate }"
          custom
          :to="{ name: 'epic', params: { key: epicKey }, query: { bucket: s.bucketKey ?? '__none__' } }"
        >
          <a
            class="seg"
            :href="href"
            :style="{ flex: `${s.weight} 1 0`, background: s.color }"
            :aria-label="`${epicName}, ${segmentDescription(s)}`"
            @mouseenter="show(segId(s.bucketKey))"
            @focus="show(segId(s.bucketKey))"
            @blur="onBlur"
            @pointerdown="onPointerDown"
            @keydown="touching = false"
            @click="onClick($event, segId(s.bucketKey), navigate)"
          />
        </RouterLink>
      </template>
      <span
        v-else
        class="emptylabel"
      >{{ bar.emptyLabel ?? '' }}</span>
    </div>
    <div
      v-if="activeSegment"
      class="tip"
      :class="tipAlign"
      :style="tipAlign === 'center' ? { left: activeSegment.centerPct + '%' } : undefined"
      aria-hidden="true"
    >
      <strong>
        <span
          class="swatch"
          :style="{ background: activeSegment.color }"
        />{{ activeSegment.name }}
      </strong>
      <span>{{ activeSegment.tasks }} {{ activeSegment.tasks === 1 ? 'ticket' : 'tickets' }} ({{ Math.round(activeSegment.pctOfEpic) }}% of epic)</span>
      <span>{{ activeSegment.points }} pts</span>
      <span>{{ activeSegment.unpointed }} unpointed</span>
    </div>
  </div>
</template>

<style scoped>
.bucketbar {
  position: relative;
  z-index: 2; /* above the card's stretched link */
}
.bar {
  display: flex;
  gap: 1px;
  height: 14px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--track);
}
.bar.empty {
  align-items: center;
  justify-content: center;
}
.emptylabel {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.seg {
  min-width: 3px;
  display: block;
}
.seg:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.tip {
  position: absolute;
  bottom: calc(100% + 6px);
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0.4rem 0.55rem;
  min-width: 9rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 4px 14px var(--shadow);
  font-size: 0.8rem;
  white-space: nowrap;
  pointer-events: none;
}
.tip.center {
  transform: translateX(-50%);
}
.tip.left {
  left: 0;
}
.tip.right {
  right: 0;
}
.swatch {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  margin-right: 0.35rem;
  border-radius: 2px;
  vertical-align: -1px;
}
</style>
