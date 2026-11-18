<script setup lang="ts">
import type { Progress } from "~~/lib/persistence/content"
import { RotateCw } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import ChartPanel from "@/components/progress/ChartPanel.vue"
import ForgettingChart from "@/components/progress/ForgettingChart.vue"
import GapBars from "@/components/progress/GapBars.vue"
import MeterRow from "@/components/progress/MeterRow.vue"
import ReviewBars from "@/components/progress/ReviewBars.vue"
import StatTile from "@/components/progress/StatTile.vue"
import TimeChart from "@/components/progress/TimeChart.vue"
import { toApiError } from "@/lib/api"
import { deckColour } from "@/lib/deck-colours"
import {
  ANSWERS_FOR_PACE,
  activityView,
  browserTimeZone,
  memoryView,
  progressErrorText,
  summariseBars,
} from "@/lib/progress"
import { cn } from "@/lib/utils"

useHead({ title: "Progress · Recall" })

const api = useApi()
const route = useRoute()
const router = useRouter()

const status = ref<"loading" | "ready" | "error">("loading")
const errorText = ref("")
const data = ref<Progress | null>(null)

async function load() {
  status.value = "loading"
  try {
    data.value = await api.getProgress(browserTimeZone())
    status.value = "ready"
  } catch (e) {
    if (toApiError(e).status === 401) return
    errorText.value = progressErrorText(e)
    status.value = "error"
  }
}
onMounted(load)

const view = computed<"activity" | "memory">(() => (route.query.view === "memory" ? "memory" : "activity"))
function show(next: "activity" | "memory") {
  router.replace({ query: next === "memory" ? { view: "memory" } : {} })
}

const activity = computed(() => (data.value ? activityView(data.value.activity) : null))
const memory = computed(() => (data.value ? memoryView(data.value.memory, data.value.activity.today) : null))

const subtitle = computed(() =>
  status.value === "ready" && activity.value?.hasReviews && view.value === "memory"
    ? "What Recall has learned about how you remember."
    : "Across all your decks.",
)

const dailySummary = computed(() =>
  activity.value ? summariseBars(activity.value.daily.bars, "Reviews in the last 30 days") : "",
)
const dueSummary = computed(() =>
  activity.value ? summariseBars(activity.value.due.bars, "Cards due in the next 7 days") : "",
)

const views = [
  { key: "activity", label: "Activity" },
  { key: "memory", label: "Memory" },
] as const
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Heading and the Activity / Memory switch -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex min-w-0 flex-col gap-1.5">
        <h1 class="text-[32px]/[38px] font-semibold tracking-[-0.5px]">Progress</h1>
        <p class="text-base text-muted-foreground">{{ subtitle }}</p>
      </div>
      <div
        v-if="status === 'ready' && activity?.hasReviews"
        role="group"
        aria-label="Progress view"
        class="flex shrink-0 gap-2"
      >
        <button
          v-for="v in views"
          :key="v.key"
          type="button"
          :aria-pressed="view === v.key"
          :class="
            cn(
              'inline-flex h-10 items-center rounded-md border-2 px-4 font-mono text-sm outline-none',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              view === v.key
                ? 'border-ink bg-card font-bold text-foreground'
                : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
            )
          "
          @click="show(v.key)"
        >
          {{ v.label }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <template v-if="status === 'loading'">
      <p class="sr-only" role="status">Loading your progress</p>
      <div class="grid gap-6 sm:grid-cols-3" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="flex flex-col gap-3 rounded-md border-2 border-ink bg-card p-6 shadow-hard">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-[46px] w-32" />
          <Skeleton class="h-4 w-40 max-w-full" />
        </div>
      </div>
      <div class="rounded-md border-2 border-ink bg-card p-7 shadow-hard" aria-hidden="true">
        <Skeleton class="mb-5 h-5 w-48" />
        <Skeleton class="h-[220px] w-full" />
      </div>
    </template>

    <!-- Could not load -->
    <section
      v-else-if="status === 'error'"
      role="alert"
      class="flex flex-col gap-4 rounded-md border-2 border-ink bg-card p-10 shadow-hard"
    >
      <h2 class="text-2xl/[30px] font-semibold">Your progress did not load</h2>
      <p class="text-base text-muted-foreground">{{ errorText }}</p>
      <div>
        <Button type="button" @click="load"><RotateCw />Try again</Button>
      </div>
    </section>

    <!-- No reviews yet -->
    <section
      v-else-if="activity && !activity.hasReviews"
      class="flex flex-col gap-3 rounded-md border-2 border-ink bg-card p-10 shadow-hard"
    >
      <h2 class="text-2xl/[30px] font-semibold">No progress to show yet</h2>
      <p class="max-w-[640px] text-base text-muted-foreground">
        Your progress appears after your first review. Review the cards that are due, then come back to see how you are
        doing.
      </p>
    </section>

    <!-- Activity -->
    <template v-else-if="activity && view === 'activity'">
      <div class="grid gap-6 sm:grid-cols-3">
        <StatTile v-for="tile in activity.tiles" :key="tile.label" :tile="tile" />
      </div>

      <ChartPanel title="Reviews per day" subtitle="Last 30 days. Each bar is the number of cards reviewed that day.">
        <ReviewBars
          variant="daily"
          :legend="activity.daily.legend"
          :bars="activity.daily.bars"
          :top="activity.daily.axis.top"
          :ticks="activity.daily.axis.ticks"
          :edge-labels="[activity.daily.xStart, activity.daily.xMid, activity.daily.xEnd]"
          :summary="dailySummary"
        />
      </ChartPanel>

      <div class="grid gap-6 lg:grid-cols-2">
        <ChartPanel title="Where your cards are" subtitle="How far away each card’s next review is.">
          <div class="flex flex-col gap-6">
            <MeterRow
              v-for="stage in activity.stages"
              :key="stage.key"
              :name="stage.name"
              :description="stage.description"
              :value="String(stage.count)"
              :share="stage.share"
              :fill="stage.fill"
              :label="`${stage.name} cards`"
            />
          </div>
        </ChartPanel>

        <ChartPanel title="Due in the next 7 days" subtitle="Cards waiting for review each day.">
          <ReviewBars
            variant="week"
            :legend="activity.due.legend"
            :bars="activity.due.bars"
            :top="activity.due.axis.top"
            :summary="dueSummary"
          />
        </ChartPanel>
      </div>
    </template>

    <!-- Memory: not enough reviews yet -->
    <section
      v-else-if="memory && memory.state === 'building'"
      class="flex flex-col gap-6 rounded-md border-2 border-ink bg-card p-10 shadow-hard"
    >
      <div class="flex flex-col gap-3">
        <h2 class="text-2xl/[30px] font-semibold">Not enough reviews yet</h2>
        <p class="max-w-[720px] text-base text-muted-foreground">
          Recall starts learning how you remember once a card has been reviewed {{ memory.meters.reviews.need }} times.
          Your pace is worked out from your correct answers. Until then, your cards follow a standard schedule.
        </p>
      </div>
      <div class="grid gap-8 sm:grid-cols-2">
        <MeterRow
          name="Most-reviewed card"
          :description="`Reviews so far, out of ${memory.meters.reviews.need}`"
          :value="memory.meters.reviews.text"
          :share="memory.meters.reviews.done / memory.meters.reviews.need"
          :fill="deckColour(0).fill"
          label="Reviews of your most-reviewed card"
        />
        <MeterRow
          name="Your pace"
          :description="`Correct answers so far, out of ${ANSWERS_FOR_PACE}`"
          :value="memory.meters.answers.text"
          :share="memory.meters.answers.done / memory.meters.answers.need"
          :fill="deckColour(2).fill"
          label="Correct answers so far"
        />
      </div>
    </section>

    <!-- Memory -->
    <template v-else-if="memory">
      <div class="grid gap-6 sm:grid-cols-3">
        <StatTile v-for="tile in memory.tiles" :key="tile.label" :tile="tile" />
      </div>

      <ChartPanel
        title="How fast you forget"
        subtitle="How likely you are to remember a card as days pass after you review it. Each dot is where Recall schedules the next review."
      >
        <ForgettingChart :curves="memory.curves" />
      </ChartPanel>

      <div class="grid gap-6 lg:grid-cols-2">
        <ChartPanel
          title="Time to answer"
          :subtitle="
            memory.state === 'ready'
              ? 'Median seconds to reveal the answer each day, last 30 days.'
              : 'Median seconds to reveal the answer each day.'
          "
        >
          <TimeChart v-if="memory.state === 'ready'" :time="memory.time" />
          <div v-else class="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center">
            <p class="text-base/6 font-semibold">Your daily times appear here</p>
            <p class="max-w-[280px] text-sm/5 text-muted-foreground">
              After {{ ANSWERS_FOR_PACE }} correct answers, Recall can show how your speed changes.
            </p>
          </div>
        </ChartPanel>

        <ChartPanel
          title="Gap after each review"
          subtitle="Average days until the next review, by how many times a card has been reviewed."
        >
          <GapBars :gaps="memory.gaps" />
        </ChartPanel>
      </div>
    </template>
  </div>
</template>
