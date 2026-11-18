<script setup lang="ts">
import type { QueueEntry } from "~~/lib/persistence/content"
import { Pencil, RotateCw, X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import DeckTag from "@/components/DeckTag.vue"
import EditAnswerDialog from "@/components/EditAnswerDialog.vue"
import Notice from "@/components/Notice.vue"
import { apiErrorMessage, toApiError } from "@/lib/api"
import { deckColour } from "@/lib/deck-colours"
import {
  SESSION_SIZE,
  ReviewTimer,
  afterFailedAnswer,
  answerNotSavedText,
  clampResponseTime,
  dueCount,
  progressPercent,
  progressText,
  resultToastText,
  reviewLoadErrorText,
  sessionEnding,
} from "@/lib/review"

definePageMeta({ layout: "focus" })
useHead({ title: "Review · Recall" })

const route = useRoute()
const api = useApi()
const toast = useToast()

const status = ref<"loading" | "error" | "ready">("loading")
const errorText = ref("")
const cards = ref<QueueEntry[]>([])
const deckNames = ref<Record<string, string>>({})

const index = ref(0)
const phase = ref<"question" | "answer">("question")
const tally = reactive({ got: 0, missed: 0 })
const ending = ref<"complete" | "early" | null>(null)

const total = computed(() => cards.value.length)
const entry = computed(() => cards.value[index.value])
const card = computed(() => entry.value?.card)
const answered = computed(() => tally.got + tally.missed)
const fill = computed(() => deckColour(card.value?.deckColour ?? 0).fill)
const deckName = computed(() => (card.value ? (deckNames.value[card.value.deckId] ?? "") : ""))

const moreDue = ref(0)
const endingText = computed(() => sessionEnding({ ...tally, total: total.value }, ending.value === "early", moreDue.value))

const timer = new ReviewTimer()

async function load() {
  status.value = "loading"
  try {
    const deck = typeof route.query.deck === "string" ? route.query.deck : undefined
    const [queue, decks] = await Promise.all([api.getQueue({ limit: SESSION_SIZE, deck }), api.listDecks()])
    deckNames.value = Object.fromEntries(decks.map((d) => [d.id, d.name]))
    cards.value = queue
    index.value = 0
    phase.value = "question"
    tally.got = tally.missed = 0
    ending.value = null
    moreDue.value = 0
    status.value = "ready"
    if (queue.length > 0) startTimer()
  } catch (e) {
    if (toApiError(e).status === 401) return
    errorText.value = reviewLoadErrorText(e)
    status.value = "error"
  }
}

async function startTimer() {
  await nextTick()
  requestAnimationFrame(() => {
    if (phase.value === "question") timer.start()
  })
}

const cardEl = ref<HTMLElement | null>(null)
const responseMs = ref(0)

async function reveal() {
  if (phase.value !== "question") return
  responseMs.value = clampResponseTime(timer.stop())
  phase.value = "answer"
  await nextTick()
  cardEl.value?.focus()
}

const submitting = ref(false)
const choice = ref<boolean | null>(null)
const saveError = ref("")

function answer(correct: boolean) {
  if (phase.value !== "answer" || submitting.value || saveError.value) return
  choice.value = correct
  submit()
}

async function submit() {
  const current = entry.value
  if (!current || choice.value === null || submitting.value) return
  const correct = choice.value
  submitting.value = true
  saveError.value = ""
  try {
    const result = await api.submitReview({
      itemStateId: current.itemStateId,
      correct,
      responseTimeMs: responseMs.value,
    })
    if (correct) tally.got++
    else tally.missed++
    toast.show(resultToastText(correct, result.nextReviewAt, new Date()), correct ? "got" : "missed")
    await next()
  } catch (e) {
    if (toApiError(e).status === 401) return
    if (afterFailedAnswer(e) === "skip") await next()
    else saveError.value = answerNotSavedText(e)
  } finally {
    submitting.value = false
  }
}

async function finish(kind: "complete" | "early") {
  moreDue.value = 0
  try {
    const deck = typeof route.query.deck === "string" ? route.query.deck : undefined
    moreDue.value = dueCount(await api.listDecks(), deck)
  } catch {
    // No second session is offered.
  }
  ending.value = kind
}

async function next() {
  choice.value = null
  saveError.value = ""
  if (index.value + 1 >= total.value) {
    await finish("complete")
    return
  }
  index.value++
  phase.value = "question"
  startTimer()
}

async function endSession() {
  if (submitting.value) return
  if (answered.value === 0) {
    await navigateTo("/")
    return
  }
  submitting.value = true
  await finish("early")
  submitting.value = false
}

const editOpen = ref(false)
const editing = ref(false)
const editError = ref("")

function openEdit() {
  if (phase.value !== "answer" || submitting.value) return
  editError.value = ""
  editOpen.value = true
}

async function saveAnswer(back: string) {
  const current = card.value
  if (!current) return
  editing.value = true
  editError.value = ""
  try {
    await api.updateCard(current.id, { back })
    current.back = back
    editOpen.value = false
  } catch (e) {
    editError.value = apiErrorMessage(e)
  } finally {
    editing.value = false
  }
}

// Keys: Space reveals, 1 is Missed it, 2 is Got it, E edits the answer.
function onKey(e: KeyboardEvent) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  if (status.value !== "ready" || ending.value || editOpen.value || total.value === 0) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return
  if (phase.value === "question") {
    if ((e.key === " " || e.code === "Space") && !target?.closest("button, a")) {
      e.preventDefault()
      reveal()
    }
    return
  }
  if (e.key === "1") answer(false)
  else if (e.key === "2") answer(true)
  else if (e.key === "e" || e.key === "E") openEdit()
}

// Time on another tab is not time spent on the card.
function onVisibility() {
  if (document.hidden) timer.pause()
  else timer.resume()
}

onMounted(() => {
  window.addEventListener("keydown", onKey)
  document.addEventListener("visibilitychange", onVisibility)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey)
  document.removeEventListener("visibilitychange", onVisibility)
})
</script>

<template>
  <header class="flex h-22 shrink-0 items-center justify-between gap-4 px-4 sm:px-12">
    <NuxtLink
      to="/"
      class="rounded-sm text-2xl/[30px] font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      Recall
    </NuxtLink>
    <Button v-if="status === 'ready' && total > 0 && !ending" type="button" variant="secondary" :disabled="submitting" @click="endSession">
      <X />End session
    </Button>
  </header>

  <main class="flex flex-1 items-center justify-center px-4 pb-6 pt-6">
    <!-- Loading -->
    <div v-if="status === 'loading'" class="flex w-full max-w-[720px] flex-col gap-6" aria-hidden="true">
      <div class="flex flex-col gap-2">
        <Skeleton class="h-4 w-[87px]" />
        <Skeleton class="h-2 w-full border-2 border-ink" />
      </div>
      <Skeleton class="h-[400px] border-2 border-ink" />
      <Skeleton class="h-12 border-2 border-ink" />
      <p class="sr-only" role="status">Loading your cards</p>
    </div>

    <!-- Could not load -->
    <section
      v-else-if="status === 'error'"
      role="alert"
      class="flex w-full max-w-[720px] flex-col gap-4 rounded-md border-2 border-ink bg-card p-10 shadow-hard"
    >
      <h1 class="text-2xl/[30px] font-semibold">Your review did not load</h1>
      <p class="text-base text-muted-foreground">{{ errorText }}</p>
      <div class="flex flex-wrap gap-3">
        <Button type="button" @click="load"><RotateCw />Try again</Button>
        <Button as-child variant="secondary"><NuxtLink to="/">Back to decks</NuxtLink></Button>
      </div>
    </section>

    <!-- Nothing due -->
    <section
      v-else-if="total === 0"
      class="flex w-full max-w-[720px] flex-col gap-4 rounded-md border-2 border-ink bg-card p-10 shadow-hard"
    >
      <h1 class="text-2xl/[30px] font-semibold">Nothing due</h1>
      <p class="text-base text-muted-foreground">You are caught up. Cards you add show up here straight away.</p>
      <div>
        <Button as-child><NuxtLink to="/">Back to decks</NuxtLink></Button>
      </div>
    </section>

    <!-- Session over -->
    <section v-else-if="ending" class="flex w-full max-w-[576px] flex-col items-center gap-8">
      <div class="flex flex-col items-center gap-2 text-center">
        <h1 class="text-[40px]/[46px] font-semibold">{{ endingText.title }}</h1>
        <p class="text-base text-muted-foreground">{{ endingText.summary }}</p>
      </div>
      <dl class="grid w-full grid-cols-2 gap-6">
        <div class="flex flex-col-reverse gap-1 rounded-md border-2 border-ink bg-recalled p-6 shadow-hard">
          <dt class="font-mono text-xs/4 font-medium">Got it</dt>
          <dd class="text-[40px]/[46px] font-semibold tracking-[-1px]">{{ tally.got }}</dd>
        </div>
        <div class="flex flex-col-reverse gap-1 rounded-md border-2 border-ink bg-missed p-6 shadow-hard">
          <dt class="font-mono text-xs/4 font-medium">Missed it</dt>
          <dd class="text-[40px]/[46px] font-semibold tracking-[-1px]">{{ tally.missed }}</dd>
        </div>
      </dl>
      <p class="text-balance text-center text-base text-muted-foreground">{{ endingText.note }}</p>
      <div v-if="moreDue > 0" class="grid w-full grid-cols-2 gap-4">
        <Button as-child variant="secondary"><NuxtLink to="/">Back to decks</NuxtLink></Button>
        <Button type="button" @click="load">Review more</Button>
      </div>
      <Button v-else as-child class="w-full"><NuxtLink to="/">Back to decks</NuxtLink></Button>
    </section>

    <!-- A card -->
    <div v-else-if="card" class="flex w-full max-w-[720px] flex-col gap-6">
      <div class="flex flex-col gap-2">
        <p class="font-mono text-xs/4 text-muted-foreground">{{ progressText(index + 1, total) }}</p>
        <Progress :model-value="progressPercent(answered, total)" :aria-label="progressText(index + 1, total)" />
      </div>

      <section
        ref="cardEl"
        tabindex="-1"
        aria-live="polite"
        class="overflow-hidden rounded-md border-2 border-ink bg-card shadow-hard outline-none"
      >
        <div class="h-[18px] border-b-2 border-ink" :style="{ backgroundColor: fill }" aria-hidden="true" />
        <div class="flex min-h-[378px] flex-col justify-between gap-8 px-5 py-8 sm:px-10">
          <DeckTag :name="deckName" :colour="card.deckColour" class="self-start" />

          <h1
            v-if="phase === 'question'"
            :key="entry.itemStateId"
            class="whitespace-pre-wrap break-words text-[26px]/8 font-semibold"
          >
            {{ card.front }}
          </h1>
          <div v-else class="flex flex-col gap-5">
            <p class="whitespace-pre-wrap break-words text-base text-muted-foreground">{{ card.front }}</p>
            <hr class="h-px border-0 bg-border" />
            <p class="whitespace-pre-wrap break-words text-[30px]/[38px] font-semibold">{{ card.back }}</p>
          </div>

          <p v-if="phase === 'question'" class="font-mono text-xs/4 text-muted-foreground max-sm:hidden">
            Press Space to reveal
          </p>
          <div v-else class="flex items-center justify-between gap-4">
            <p class="font-mono text-xs/4 text-muted-foreground max-sm:hidden">
              Press 1 for Missed it, 2 for Got it, E to edit
            </p>
            <button
              type="button"
              class="ml-auto flex items-center gap-1.5 rounded-sm font-mono text-xs/4 font-medium outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              @click="openEdit"
            >
              <Pencil class="size-4" aria-hidden="true" />Edit card
            </button>
          </div>
        </div>
      </section>

      <Button v-if="phase === 'question'" type="button" class="w-full" @click="reveal">Reveal answer</Button>
      <div v-else-if="saveError" class="flex flex-col gap-3">
        <Notice variant="error" :lines="[saveError]" />
        <Button type="button" class="w-full" :disabled="submitting" @click="submit"><RotateCw />Try again</Button>
      </div>
      <div v-else class="grid grid-cols-2 gap-4">
        <Button type="button" variant="missed" :disabled="submitting" @click="answer(false)">Missed it</Button>
        <Button type="button" variant="got" :disabled="submitting" @click="answer(true)">Got it</Button>
      </div>

      <EditAnswerDialog
        v-model:open="editOpen"
        :question="card.front"
        :initial-answer="card.back"
        :pending="editing"
        :server-error="editError"
        @submit="saveAnswer"
      />
    </div>
  </main>
</template>
