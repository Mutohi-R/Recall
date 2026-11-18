<script setup lang="ts">
import type { ChartData, ChartOptions } from "chart.js"
import { Bar } from "vue-chartjs"
import DeckLegend from "@/components/progress/DeckLegend.vue"
import type { LegendItem, StackedBar } from "@/lib/progress"
import { CHART } from "@/lib/chart-theme"
import { baselinePlugin, valueLabelsPlugin } from "@/lib/chart-plugins"
import { setupCharts } from "@/lib/chart-setup"

const props = defineProps<{
  variant: "daily" | "week"
  legend: LegendItem[]
  bars: StackedBar[]
  top: number
  ticks?: number[]
  edgeLabels?: [string, string, string]
  summary: string
}>()

setupCharts()
const fontsReady = useFontsReady()

const data = computed<ChartData<"bar">>(() => ({
  labels: props.bars.map((b) => b.label),
  datasets: props.legend.map((item) => ({
    label: item.name,
    data: props.bars.map((b) => b.segments.find((s) => s.key === item.key)?.count ?? null),
    backgroundColor: item.fill,
    borderColor: CHART.ink,
    borderWidth: 1.5,
    borderRadius: { topLeft: 2, topRight: 2 },
    borderSkipped: false,
    stack: "decks",
    barPercent: 1,
    categoryPercentage: props.variant === "daily" ? 0.62 : 0.6,
  })),
}))

const last = computed(() => props.bars.length - 1)
const mid = computed(() => Math.floor(last.value / 2))

const options = computed<ChartOptions<"bar">>(() => {
  const daily = props.variant === "daily"
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: daily ? 8 : 24 } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        border: { display: false },
        ticks: {
          autoSkip: false,
          maxRotation: 0,
          padding: 12,
          align: daily ? "inner" : "center",
          color: daily ? CHART.muted : CHART.ink,
          callback(_value, i) {
            if (!daily) return props.bars[i]?.label ?? ""
            const at = [0, mid.value, last.value].indexOf(i)
            return at === -1 ? "" : (props.edgeLabels?.[at] ?? "")
          },
        },
      },
      y: {
        stacked: true,
        min: 0,
        max: props.top,
        display: daily,
        grid: { color: CHART.grid, lineWidth: 1.5 },
        border: { display: false },
        ticks: { padding: 14, stepSize: props.ticks ? props.top / 2 : undefined },
      },
    },
  }
})

const plugins = computed(() => [
  baselinePlugin,
  ...(props.variant === "week"
    ? [valueLabelsPlugin(() => props.bars.map((b) => (b.total > 0 ? String(b.total) : null)))]
    : []),
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <DeckLegend :items="legend" />
    <div class="relative h-[220px] w-full" role="img" :aria-label="summary">
      <Bar v-if="fontsReady" :data="data" :options="options" :plugins="plugins" />
    </div>
  </div>
</template>
