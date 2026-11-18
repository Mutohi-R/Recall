<script setup lang="ts">
import type { DeckSummary } from "~~/lib/persistence/content"
import { Play, Plus, RotateCw } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import DeckFormDialog from "@/components/DeckFormDialog.vue"
import DeckRow from "@/components/DeckRow.vue"
import { apiErrorMessage, toApiError } from "@/lib/api"
import { deckListErrorText, dueSummary } from "@/lib/decks"

useHead({ title: "Decks · Recall" })

const api = useApi()

const status = ref<"loading" | "ready" | "error">("loading")
const decks = ref<DeckSummary[]>([])
const errorText = ref("")

async function load() {
  status.value = "loading"
  try {
    decks.value = await api.listDecks()
    status.value = "ready"
  } catch (e) {
    if (toApiError(e).status === 401) return
    errorText.value = deckListErrorText(e)
    status.value = "error"
  }
}
onMounted(load)

const summary = computed(() => dueSummary(decks.value))

// New deck
const createOpen = ref(false)
const creating = ref(false)
const createError = ref("")

function openCreate() {
  createError.value = ""
  createOpen.value = true
}

async function createDeck(name: string) {
  creating.value = true
  createError.value = ""
  try {
    decks.value = [...decks.value, await api.createDeck(name)]
    createOpen.value = false
  } catch (e) {
    createError.value = apiErrorMessage(e)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <!-- Loading -->
    <template v-if="status === 'loading'">
      <p class="sr-only" role="status">Loading your decks</p>
      <div
        aria-hidden="true"
        class="flex items-center justify-between gap-6 rounded-md border-2 border-ink bg-card px-8 py-7 shadow-hard"
      >
        <div class="flex flex-col gap-3">
          <Skeleton class="h-[30px] w-[200px]" />
          <Skeleton class="h-4 w-[300px] max-w-full" />
        </div>
        <Skeleton class="hidden h-12 w-[177px] sm:block" />
      </div>
      <div class="flex items-center justify-between">
        <h2 class="text-2xl/[30px] font-semibold">Your decks</h2>
        <Button type="button" variant="secondary" disabled><Plus />New deck</Button>
      </div>
      <div class="flex flex-col gap-4" aria-hidden="true">
        <div
          v-for="n in 4"
          :key="n"
          class="flex h-22 items-center justify-between rounded-md border-2 border-ink bg-card px-6 shadow-hard"
        >
          <div class="flex flex-col gap-2.5">
            <Skeleton class="h-[18px] w-[180px] max-w-full" />
            <Skeleton class="h-3 w-[90px]" />
          </div>
          <Skeleton class="h-6 w-[72px]" />
        </div>
      </div>
    </template>

    <!-- Could not load -->
    <section
      v-else-if="status === 'error'"
      role="alert"
      class="flex flex-col gap-4 rounded-md border-2 border-ink bg-card p-10 shadow-hard"
    >
      <h1 class="text-2xl/[30px] font-semibold">Your decks did not load</h1>
      <p class="text-base text-muted-foreground">{{ errorText }}</p>
      <div>
        <Button type="button" @click="load"><RotateCw />Try again</Button>
      </div>
    </section>

    <!-- No decks yet -->
    <section v-else-if="decks.length === 0" class="flex flex-col items-center gap-5 pt-24 text-center">
      <h1 class="text-[32px]/[38px] font-semibold tracking-[-0.5px]">Make your first deck</h1>
      <p class="max-w-[520px] text-base text-muted-foreground">
        A deck holds the cards you want to learn. Add a card and it joins your first review straight away.
      </p>
      <Button type="button" @click="openCreate"><Plus />New deck</Button>
    </section>

    <!-- Decks -->
    <template v-else>
      <section
        class="flex flex-col items-start justify-between gap-6 rounded-md border-2 border-ink bg-card px-8 py-7 shadow-hard sm:flex-row sm:items-center"
      >
        <div class="flex min-w-0 flex-col gap-1.5">
          <h1 class="text-[40px]/[46px] font-semibold tracking-[-1px]">{{ summary.title }}</h1>
          <p class="text-base text-muted-foreground">{{ summary.detail }}</p>
        </div>
        <Button v-if="summary.canStart" as-child class="shrink-0">
          <NuxtLink to="/review"><Play />Start review</NuxtLink>
        </Button>
      </section>
      <div class="flex items-center justify-between">
        <h2 class="text-2xl/[30px] font-semibold">Your decks</h2>
        <Button type="button" variant="secondary" @click="openCreate"><Plus />New deck</Button>
      </div>
      <ul class="flex flex-col gap-4">
        <li v-for="deck in decks" :key="deck.id"><DeckRow :deck="deck" /></li>
      </ul>
    </template>

    <DeckFormDialog
      v-model:open="createOpen"
      mode="create"
      :pending="creating"
      :server-error="createError"
      @submit="createDeck"
    />
  </div>
</template>