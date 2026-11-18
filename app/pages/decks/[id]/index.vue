<script setup lang="ts">
import type { DeckSummary } from "~~/lib/persistence/content"
import type { ImportCard } from "~~/lib/import-cards"
import { ArrowLeft, List, Pencil, Play, Plus, RotateCw, Trash2, Upload } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import AddCardDialog from "@/components/AddCardDialog.vue"
import DeckFormDialog from "@/components/DeckFormDialog.vue"
import DeleteDeckDialog from "@/components/DeleteDeckDialog.vue"
import ImportCardsDialog from "@/components/ImportCardsDialog.vue"
import { apiErrorMessage, toApiError } from "@/lib/api"
import { deckColour } from "@/lib/deck-colours"
import { importedText } from "@/lib/cards"
import { cardsLabel, caughtUpText, deckErrorText } from "@/lib/decks"

const route = useRoute()
const api = useApi()
const toast = useToast()
const deckId = String(route.params.id)

const status = ref<"loading" | "ready" | "error">("loading")
const deck = ref<DeckSummary | null>(null)
const errorText = ref("")

useHead({ title: computed(() => (deck.value ? `${deck.value.name} · Recall` : "Deck · Recall")) })

async function load(quiet = false) {
  if (!quiet) status.value = "loading"
  try {
    const found = (await api.listDecks()).find((d) => d.id === deckId)
    if (!found) {
      showError({ statusCode: 404, statusMessage: "Page not found" })
      return
    }
    deck.value = found
    status.value = "ready"
  } catch (e) {
    if (toApiError(e).status === 401 || quiet) return
    errorText.value = deckErrorText(e)
    status.value = "error"
  }
}
onMounted(() => load())

const fill = computed(() => deckColour(deck.value?.colour ?? 0).fill)
const hasCards = computed(() => (deck.value?.cardCount ?? 0) > 0)
const dueNow = computed(() => deck.value?.dueCount ?? 0)

// Edit deck
const editOpen = ref(false)
const saving = ref(false)
const editError = ref("")

function openEdit() {
  editError.value = ""
  editOpen.value = true
}

async function saveName(name: string) {
  if (!deck.value) return
  saving.value = true
  editError.value = ""
  try {
    await api.renameDeck(deckId, name)
    deck.value = { ...deck.value, name }
    editOpen.value = false
  } catch (e) {
    editError.value = apiErrorMessage(e)
  } finally {
    saving.value = false
  }
}

// Delete deck
const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref("")

function openDelete() {
  deleteError.value = ""
  deleteOpen.value = true
}

async function removeDeck() {
  deleting.value = true
  deleteError.value = ""
  try {
    await api.deleteDeck(deckId)
    await navigateTo("/")
  } catch (e) {
    deleteError.value = apiErrorMessage(e)
    deleting.value = false
  }
}

// Add card
const addOpen = ref(false)
const adding = ref(false)
const addError = ref("")
const addDialog = ref<{ reset: () => void } | null>(null)

function openAdd() {
  addError.value = ""
  addOpen.value = true
}

async function addCard(card: { front: string; back: string; addAnother: boolean }) {
  adding.value = true
  addError.value = ""
  try {
    await api.createCard(deckId, card.front, card.back)
    await load(true)
    if (card.addAnother) addDialog.value?.reset()
    else addOpen.value = false
  } catch (e) {
    addError.value = apiErrorMessage(e)
  } finally {
    adding.value = false
  }
}

// Import cards
const importOpen = ref(false)
const importing = ref(false)
const importError = ref("")

function openImport() {
  importError.value = ""
  importOpen.value = true
}

async function importCards(cards: ImportCard[]) {
  importing.value = true
  importError.value = ""
  try {
    const { added } = await api.importCards(deckId, cards)
    await load(true)
    importOpen.value = false
    if (deck.value) toast.show(importedText(added, deck.value.name))
  } catch (e) {
    importError.value = apiErrorMessage(e)
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink
      to="/"
      class="flex w-fit items-center gap-2 rounded-sm font-mono text-xs/4 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeft class="size-4 text-foreground" aria-hidden="true" />
      Back to decks
    </NuxtLink>

    <!-- Loading -->
    <template v-if="status === 'loading'">
      <p class="sr-only" role="status">Loading the deck</p>
      <div class="flex items-center gap-4" aria-hidden="true">
        <Skeleton class="size-8" />
        <div class="flex flex-col gap-2">
          <Skeleton class="h-[30px] w-[215px] max-w-full" />
          <Skeleton class="h-3 w-[58px]" />
        </div>
      </div>
      <Skeleton class="h-[257px] border-2 border-ink" />
    </template>

    <!-- Could not load -->
    <section
      v-else-if="status === 'error'"
      role="alert"
      class="flex flex-col gap-4 rounded-md border-2 border-ink bg-card p-10 shadow-hard"
    >
      <h1 class="text-2xl/[30px] font-semibold">This deck did not load</h1>
      <p class="text-base text-muted-foreground">{{ errorText }}</p>
      <div>
        <Button type="button" @click="load()"><RotateCw />Try again</Button>
      </div>
    </section>

    <template v-else-if="deck">
      <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div class="flex min-w-0 items-center gap-4">
          <span
            class="size-8 shrink-0 rounded-md border-2 border-ink"
            :style="{ backgroundColor: fill }"
            aria-hidden="true"
          />
          <div class="flex min-w-0 flex-col gap-0.5">
            <h1 class="truncate text-[32px]/[38px] font-semibold tracking-[-0.5px]">{{ deck.name }}</h1>
            <p class="font-mono text-xs/4 text-muted-foreground">{{ cardsLabel(deck.cardCount) }}</p>
          </div>
        </div>
        <div class="flex gap-3">
          <Button type="button" variant="secondary" @click="openEdit"><Pencil />Edit deck</Button>
          <Button type="button" variant="secondary" @click="openDelete"><Trash2 />Delete deck</Button>
        </div>
      </div>

      <section class="overflow-hidden rounded-md border-2 border-ink bg-card shadow-hard">
        <div class="h-[18px] border-b-2 border-ink" :style="{ backgroundColor: fill }" aria-hidden="true" />

        <!-- No cards yet -->
        <div v-if="!hasCards" class="flex flex-col items-center gap-4 px-8 py-12 text-center">
          <h2 class="text-lg/6 font-semibold">No cards yet</h2>
          <p class="text-base text-muted-foreground">Add a card and it joins your next review straight away.</p>
          <div class="flex flex-wrap justify-center gap-3">
            <Button type="button" variant="secondary" @click="openImport"><Upload />Import cards</Button>
            <Button type="button" @click="openAdd"><Plus />Add card</Button>
          </div>
        </div>

        <div v-else class="flex flex-col gap-7 p-8">
          <dl class="flex gap-16">
            <div class="flex flex-col-reverse gap-1">
              <dt class="font-mono text-xs/4 font-medium text-muted-foreground">Due now</dt>
              <dd class="text-[40px]/[46px] font-semibold tracking-[-1px]">{{ dueNow }}</dd>
            </div>
            <div class="flex flex-col-reverse gap-1">
              <dt class="font-mono text-xs/4 font-medium text-muted-foreground">Cards in deck</dt>
              <dd class="text-[40px]/[46px] font-semibold tracking-[-1px]">{{ deck.cardCount }}</dd>
            </div>
          </dl>
          <hr class="h-px border-0 bg-border" />
          <p v-if="dueNow === 0" class="text-base text-muted-foreground">
            {{ caughtUpText(deck.nextDueAt, new Date()) }}
          </p>
          <div class="flex flex-wrap gap-4">
            <Button v-if="dueNow > 0" as-child>
              <NuxtLink :to="{ path: '/review', query: { deck: deck.id } }"><Play />Start review</NuxtLink>
            </Button>
            <Button type="button" variant="secondary" @click="openAdd"><Plus />Add card</Button>
            <Button as-child variant="secondary">
              <NuxtLink :to="`/decks/${deck.id}/cards`"><List />Manage cards</NuxtLink>
            </Button>
          </div>
        </div>
      </section>

      <DeckFormDialog
        v-model:open="editOpen"
        mode="edit"
        :initial-name="deck.name"
        :pending="saving"
        :server-error="editError"
        @submit="saveName"
      />
      <DeleteDeckDialog
        v-model:open="deleteOpen"
        :deck-name="deck.name"
        :card-count="deck.cardCount"
        :pending="deleting"
        :server-error="deleteError"
        @confirm="removeDeck"
      />
      <AddCardDialog
        ref="addDialog"
        v-model:open="addOpen"
        :pending="adding"
        :server-error="addError"
        @submit="addCard"
      />
      <ImportCardsDialog
        v-model:open="importOpen"
        :deck-name="deck.name"
        :pending="importing"
        :server-error="importError"
        @submit="importCards"
      />
    </template>
  </div>
</template>
