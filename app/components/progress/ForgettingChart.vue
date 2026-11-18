<script setup lang="ts">
import type { ChartData, ChartOptions, Plugin } from "chart.js"
import { Line } from "vue-chartjs"
import { CHART } from "@/lib/chart-theme"
import { baselinePlugin } from "@/lib/chart-plugins"
import { setupCharts } from "@/lib/chart-setup"
import { type CurveLine, forgettingCurve } from "@/lib/progress"

const props = defineProps<{ curves: CurveLine[] }>()

setupCharts()
const fontsReady = useFontsReady()

const box = ref<HTMLElement | null>(null)
const width = ref(900)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!box.value) return
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = entry.contentRect.width
  })
  observer.observe(box.value)
})
onBeforeUnmount(() => observer?.disconnect())

const compact = computed(() => width.value < 620)

const COLOUR = computed(() => ({
  stronger: CHART.curve.stronger,
  typical: CHART.curve.typical,
  weaker: CHART.curve.weaker,
}))

const data = computed<ChartData<"line", { x: number; y: number }[]>>(() => ({
  datasets: [
    ...props.curves.map((c) => ({
      label: c.name,
      data: forgettingCurve(c.stability, 30, 0.25).map((p) => ({ x: p.days, y: p.recall * 100 })),
      borderColor: COLOUR.value[c.key],
      borderWidth: 3,
      pointRadius: 0,
      tension: 0,
      order: 3,
    })),
    {
      label: "Recall at which the next review is set",
      data: [
        { x: 0, y: 90 },
        { x: 30, y: 90 },
      ],
      borderColor: CHART.ink,
      borderWidth: 1.5,
      borderDash: [4, 4],
      pointRadius: 0,
      order: 4,
    },
    {
      label: "Next review",
      data: props.curves.map((c) => ({ x: c.reviewAfterDays, y: 90 })),
      showLine: false,
      backgroundColor: props.curves.map((c) => COLOUR.value[c.key]),
      borderColor: CHART.ink,
      borderWidth: 1.5,
      pointRadius: 6,
      order: 1,
    },
  ],
}))

const labels = computed<Plugin>(() => ({
  id: "recallCurveLabels",
  afterDatasetsDraw(chart) {
    const { ctx, scales } = chart
    const x = scales.x!
    const y = scales.y!
    ctx.save()
    ctx.textBaseline = "middle"
    ctx.textAlign = "left"
    if (!compact.value) {
      for (const c of props.curves) {
        const yy = y.getPixelForValue(Math.exp(-30 / c.stability) * 100)
        const xx = x.getPixelForValue(30) + 14
        ctx.fillStyle = CHART.ink
        ctx.font = `600 13px ${CHART.sans}`
        ctx.fillText(c.name, xx, yy - 8)
        ctx.fillStyle = CHART.muted
        ctx.font = `11px ${CHART.mono}`
        ctx.fillText(`stability ${Math.round(c.stability)} days`, xx, yy + 10)
      }
    }
    if (!compact.value) {
      ctx.fillStyle = CHART.muted
      ctx.font = `11px ${CHART.mono}`
      ctx.textAlign = "right"
      ctx.fillText("Next review is set where recall reaches 90%", x.right, y.getPixelForValue(90) - 12)
    }
    ctx.restore()
  },
}))

const options = computed<ChartOptions<"line">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  parsing: false,
  layout: { padding: { top: 8, right: compact.value ? 8 : 170 } },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: {
    x: {
      type: "linear",
      min: 0,
      max: 30,
      grid: { display: false },
      border: { display: false },
      ticks: { stepSize: 10, padding: 12, callback: (v) => (v === 30 ? "30 days" : String(v)) },
    },
    y: {
      min: 0,
      max: 100,
      grid: { color: CHART.grid, lineWidth: 1.5 },
      border: { display: false },
      ticks: { stepSize: 25, padding: 14, callback: (v) => `${v}%` },
    },
  },
}))

const summary = computed(
  () =>
    "Chance of remembering a card over 30 days. " +
    props.curves
      .map(
        (c) =>
          `${c.name}, stability ${Math.round(c.stability)} days: ${Math.round(c.endRecall * 100)}% after 30 days, next review after ${c.reviewAfterDays.toFixed(1)} days`,
      )
      .join("; ") +
    ".",
)
</script>

<template>
  <div ref="box" class="flex flex-col gap-4">
    <div class="relative h-[300px] w-full" role="img" :aria-label="summary">
      <Line v-if="fontsReady" :data="data" :options="options" :plugins="[baselinePlugin, labels]" />
    </div>
    <p v-if="compact" class="font-mono text-xs text-muted-foreground">
      The dashed line is where Recall sets the next review: when recall reaches 90%.
    </p>
    <ul v-if="compact" class="flex flex-col gap-2">
      <li v-for="c in curves" :key="c.key" class="flex items-center gap-3">
        <span class="h-1 w-5 shrink-0" :style="{ backgroundColor: COLOUR[c.key] }" aria-hidden="true" />
        <span class="text-sm/5 font-semibold">{{ c.name }}</span>
        <span class="font-mono text-xs text-muted-foreground">stability {{ Math.round(c.stability) }} days</span>
      </li>
    </ul>
  </div>
</template>
