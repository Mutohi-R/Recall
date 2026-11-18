<script setup lang="ts">
import type { ChartData, ChartOptions } from "chart.js"
import { Bar } from "vue-chartjs"
import { deckColour } from "@/lib/deck-colours"
import { CHART } from "@/lib/chart-theme"
import { baselinePlugin, valueLabelsPlugin } from "@/lib/chart-plugins"
import { setupCharts } from "@/lib/chart-setup"

const props = defineProps<{ gaps: { label: string; days: number; text: string }[] }>()

setupCharts()
const fontsReady = useFontsReady()

const data = computed<ChartData<"bar">>(() => ({
  labels: props.gaps.map((g) => g.label),
  datasets: [
    {
      label: "Days until the next review",
      data: props.gaps.map((g) => g.days),
      backgroundColor: deckColour(0).fill,
      borderColor: CHART.ink,
      borderWidth: 1.5,
      borderRadius: { topLeft: 2, topRight: 2 },
      borderSkipped: false,
      barPercent: 1,
      categoryPercentage: 0.6,
      minBarLength: 6,
    },
  ],
}))

const options = computed<ChartOptions<"bar">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 24 } },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { padding: 12, color: CHART.muted },
    },
    y: { min: 0, max: Math.max(1, ...props.gaps.map((g) => g.days)) * 1.02, display: false },
  },
}))

const plugins = computed(() => [baselinePlugin, valueLabelsPlugin(() => props.gaps.map((g) => g.text))])

const summary = computed(
  () => "Average days until the next review: " + props.gaps.map((g) => `${g.label} review ${g.text}`).join(", ") + ".",
)
</script>

<template>
  <div class="relative h-[240px] w-full" role="img" :aria-label="summary">
    <Bar v-if="fontsReady" :data="data" :options="options" :plugins="plugins" />
  </div>
</template>
