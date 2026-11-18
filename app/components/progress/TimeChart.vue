<script setup lang="ts">
import type { ChartData, ChartOptions, Plugin } from "chart.js"
import { Line } from "vue-chartjs"
import { CHART } from "@/lib/chart-theme"
import { baselinePlugin } from "@/lib/chart-plugins"
import { setupCharts } from "@/lib/chart-setup"
import { type MemoryView, dayLabel } from "@/lib/progress"

const props = defineProps<{ time: MemoryView["time"] }>()

setupCharts()
const fontsReady = useFontsReady()

const points = computed(() =>
  props.time.days.flatMap((d, i) => (d.seconds === null ? [] : [{ x: i, y: d.seconds }])),
)
const last = computed(() => props.time.days.length - 1)
const mid = computed(() => Math.floor(last.value / 2))

const data = computed<ChartData<"line", { x: number; y: number }[]>>(() => ({
  datasets: [
    ...(props.time.pace === null
      ? []
      : [
          {
            label: "Usual pace",
            data: [
              { x: 0, y: props.time.pace },
              { x: last.value, y: props.time.pace },
            ],
            borderColor: CHART.ink,
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            order: 2,
          },
        ]),
    {
      label: "Median time to answer",
      data: points.value,
      borderColor: CHART.ink,
      borderWidth: 1.5,
      tension: 0,
      pointRadius: 4,
      pointBackgroundColor: CHART.dot,
      pointBorderColor: CHART.ink,
      pointBorderWidth: 1.2,
      order: 1,
    },
  ],
}))

const usual = computed<Plugin>(() => ({
  id: "recallUsualPace",
  afterDatasetsDraw(chart) {
    const pace = props.time.pace
    if (pace === null) return
    const { ctx, scales } = chart
    const yy = scales.y!.getPixelForValue(pace)
    ctx.save()
    ctx.textBaseline = "middle"
    ctx.textAlign = "left"
    ctx.font = `11px ${CHART.mono}`
    ctx.fillStyle = CHART.muted
    ctx.fillText("Usual", scales.x!.right + 8, yy - 8)
    ctx.fillStyle = CHART.ink
    ctx.fillText(`${pace.toFixed(1)} s`, scales.x!.right + 8, yy + 8)
    ctx.restore()
  },
}))

const options = computed<ChartOptions<"line">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  parsing: false,
  layout: { padding: { top: 8, right: props.time.pace === null ? 8 : 46 } },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: {
    x: {
      type: "linear",
      min: -0.4,
      max: last.value + 0.4,
      grid: { display: false },
      border: { display: false },
      afterBuildTicks(axis) {
        axis.ticks = [0, mid.value, last.value].map((value) => ({ value }))
      },
      ticks: {
        padding: 12,
        maxRotation: 0,
        autoSkip: false,
        align: "inner",
        callback: (v) => {
          const day = props.time.days[Number(v)]?.day
          return day ? dayLabel(day) : ""
        },
      },
    },
    y: {
      min: props.time.axis.lo,
      max: props.time.axis.hi,
      grid: { color: CHART.grid, lineWidth: 1.5 },
      border: { display: false },
      ticks: { stepSize: (props.time.axis.hi - props.time.axis.lo) / 2, padding: 14, callback: (v) => `${v} s` },
    },
  },
}))

const summary = computed(() => {
  const values = points.value.map((p) => p.y)
  if (values.length === 0) return "No correct answers in the last 30 days."
  return (
    `Median seconds to answer, last 30 days: from ${values[0]!.toFixed(1)} s to ${values.at(-1)!.toFixed(1)} s` +
    (props.time.pace === null ? "." : `, against a usual pace of ${props.time.pace.toFixed(1)} s.`)
  )
})
</script>

<template>
  <div class="relative h-[220px] w-full" role="img" :aria-label="summary">
    <Line v-if="fontsReady" :data="data" :options="options" :plugins="[baselinePlugin, usual]" />
  </div>
</template>
