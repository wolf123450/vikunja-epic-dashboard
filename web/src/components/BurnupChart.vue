<script setup lang="ts">
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkAreaComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BurnupPointDTO } from '../../../shared/api';
import { buildBurnupSeries, type BurnupMetric } from '../lib/burnup';
import { store } from '../store';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, CanvasRenderer]);

const props = defineProps<{ points: BurnupPointDTO[]; metric: BurnupMetric }>();
const el = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function render(): void {
  if (!el.value) return;
  chart ??= echarts.init(el.value);
  const s = buildBurnupSeries(props.points, props.metric);
  const unit = props.metric === 'points' ? 'pts' : 'tasks';
  const text = css('--text');
  const muted = css('--text-muted');
  const border = css('--border');
  chart.setOption(
    {
      animation: false,
      textStyle: { color: text },
      grid: { left: 44, right: 16, top: 36, bottom: 28 },
      legend: { top: 0, textStyle: { color: text } },
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${String(v)} ${unit}` },
      xAxis: { type: 'category', data: s.dates, boundaryGap: false, axisLabel: { color: muted }, axisLine: { lineStyle: { color: border } } },
      yAxis: { type: 'value', name: unit, nameTextStyle: { color: muted }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: border } } },
      series: [
        {
          name: `Scope (${unit})`,
          type: 'line',
          data: s.scope,
          symbol: 'none',
          step: 'end',
          lineStyle: { type: 'dashed', width: 2, color: css('--warn') },
          itemStyle: { color: css('--warn') },
          markArea: s.reconstructed
            ? {
                silent: true,
                itemStyle: { color: css('--border'), opacity: 0.45 },
                label: { show: true, position: 'insideTop', color: text, formatter: 'approximate' },
                data: [[{ xAxis: s.reconstructed[0] }, { xAxis: s.reconstructed[1] }]],
              }
            : undefined,
        },
        {
          name: `Completed (${unit})`,
          type: 'line',
          data: s.done,
          symbol: 'none',
          lineStyle: { width: 2, color: css('--success') },
          itemStyle: { color: css('--success') },
        },
      ],
    },
    true,
  );
}

onMounted(() => {
  render();
  observer = new ResizeObserver(() => chart?.resize());
  if (el.value) observer.observe(el.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
  chart = null;
});
watch(() => [props.points, props.metric, store.theme], render);
</script>

<template>
  <div
    ref="el"
    class="chart"
    role="img"
    aria-label="Burn-up chart: scope and completed work over time"
  />
</template>

<style scoped>
.chart {
  width: 100%;
  height: 300px;
}
</style>
