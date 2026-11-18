<script setup lang="ts">
import type { CardRecord, DeckSummary } from "~~/lib/persistence/content"
import type { ImportCard } from "~~/lib/import-cards"
import { ArrowLeft, Plus, RotateCw, Search, Upload } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import AddCardDialog from "@/components/AddCardDialog.vue"
import CardEditor from "@/components/CardEditor.vue"
import DeleteCardDialog from "@/components/DeleteCardDialog.vue"
import ImportCardsDialog from "@/components/ImportCardsDialog.vue"
import { apiErrorMessage, toApiError } from "@/lib/api"
import { filterCards, importedText } from "@/lib/cards"
import { deckColour } from "@/lib/deck-colours"
import { cardsLabel, deckErrorText } from "@/lib/decks"
import { cn } from "@/lib/utils"

definePageMeta({ wide: true })

const route = useRoute()
const api = useApi()
const toast = useToast()
const deckId = String(route.params.id)

const status = ref<"loading" | "ready" | "error">("loading")
const deck = ref<DeckSummary | null>(null)
const cards = ref<CardRecord[]>([])
const errorText = ref("")

useHead({ title: computed(() => (deck.value ? `Manage cards · ${deck.value.name} · Recall` : "Manage cards · Recall")) })

async function load(quiet = false) {
  if (!quiet) status.value = "loading"
  try {
    const [decks, list] = await Promise.all([api.listDecks(), api.listCards(deckId)])
    const found = decks.find((d) => d.id === deckId)
    if (!found) {
      showError({ statusCode: 404, statusMessage: "Page not found" })
      return
    }
    deck.value = found
    cards.value = list
    if (selectedId.value && !list.some((c) => c.id === selectedId.value)) selectedId.value = null
    status.value = "ready"
  } catch (e) {
    if (toApiError(e).status === 401 || quiet) return
    if (toApiError(e).status === 404) {
      showError({ statusCode: 404, statusMessage: "Page not found" })
      return
    }
    errorText.value = deckErrorText(e)
    status.value = "error"
  }
}
onMounted(() => load())

const fill = computed(() => deckColour(deck.value?.colour ?? 0).fill)

// Search and choosing a card
const query = ref("")
const selectedId = ref<string | null>(null)
const shown = computed(() => filterCards(cards.value, query.value))
const selected = computed(() => cards.value.find((c) => c.id === selectedId.value) ?? null)

function choose(card: CardRecord) {
  editError.value = ""
  selectedId.value = card.id
}

// Save changes
const saving = ref(false)
const editError = ref("")

async function save(changes: { front?: string; back?: string }) {
  const card = selected.value
  if (!card) return
  saving.value = true
  editError.value = ""
  try {
    await api.updateCard(card.id, changes)
    cards.value = cards.value.map((c) => (c.id === card.id ? { ...c, ...changes } : c))
  } catch (e) {
    editError.value = apiErrorMessage(e)
  } finally {
    saving.value = false
  }
}

// Delete card
const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref("")

function openDelete() {
  deleteError.value = ""
  deleteOpen.value = true
}

async function removeCard() {
  const card = selected.value
  if (!card || !deck.value) return
  deleting.value = true
  deleteError.value = ""
  try {
    await api.deleteCard(card.id)
    cards.value = cards.value.filter((c) => c.id !== card.id)
    deck.value = { ...deck.value, cardCount: Math.max(0, deck.value.cardCount - 1) }
    selectedId.value = null
    deleteOpen.value = false
    // The card may have been due: refresh the counts in the background.
    load(true)
  } catch (e) {
    deleteError.value = apiErrorMessage(e)
  } finally {
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

async function importCards(list: ImportCard[]) {
  if (!deck.value) return
  importing.value = true
  importError.value = ""
  try {
    const { added } = await api.importCards(deckId, list)
    await load(true)
    importOpen.value = false
    toast.show(importedText(added, deck.value.name))
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
      :to="`/decks/${deckId}`"
      class="flex w-fit items-center gap-2 rounded-sm font-mono text-xs/4 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeft class="size-4 text-foreground" aria-hidden="true" />
      Back to {{ deck?.name ?? "deck" }}
    </NuxtLink>

    <!-- Loading -->
    <template v-if="status === 'loading'">
      <p class="sr-only" role="status">Loading the cards</p>
      <div class="flex items-center gap-4" aria-hidden="true">
        <Skeleton class="size-8" />
        <div class="flex flex-col gap-2">
          <Skeleton class="h-[38px] w-[260px] max-w-full" />
          <Skeleton class="h-3 w-[140px]" />
        </div>
      </div>
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_416px]" aria-hidden="true">
        <div class="flex flex-col gap-4">
          <Skeleton class="h-13 border-2 border-ink" />
          <Skeleton class="h-[300px] border-2 border-ink" />
        </div>
        <Skeleton class="hidden h-56 border-2 border-ink lg:block" />
      </div>
    </template>

    <!-- Could not load -->
    <section
      v-else-if="status === 'error'"
      role="alert"
      class="flex flex-col gap-4 rounded-md border-2 border-ink bg-card p-10 shadow-hard"
    >
      <h1 class="text-2xl/[30px] font-semibold">The cards did not load</h1>
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
            <h1 class="text-[32px]/[38px] font-semibold tracking-[-0.5px]">Manage cards</h1>
            <p class="truncate font-mono text-xs/4 text-muted-foreground">
              {{ deck.name }} · {{ cardsLabel(deck.cardCount) }}
            </p>
          </div>
        </div>
        <div class="flex gap-3">
          <Button type="button" variant="secondary" @click="openImport"><Upload />Import cards</Button>
          <Button type="button" @click="openAdd"><Plus />Add card</Button>
        </div>
      </div>

      <!-- No cards yet -->
      <section
        v-if="cards.length === 0"
        class="flex flex-col items-center gap-3 rounded-md border-2 border-ink bg-card px-10 py-14 text-center shadow-hard"
      >
        <h2 class="text-lg/6 font-semibold">No cards yet</h2>
        <p class="text-base text-muted-foreground">Add a card and it joins your next review straight away.</p>
        <div class="flex flex-wrap justify-center gap-3">
          <Button type="button" variant="secondary" @click="openImport"><Upload />Import cards</Button>
          <Button type="button" @click="openAdd"><Plus />Add card</Button>
        </div>
      </section>

      <div v-else class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_416px]">
        <div class="flex min-w-0 flex-col gap-4">
          <div class="relative">
            <Search
              class="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input v-model="query" type="search" class="pl-10" placeholder="Search cards" aria-label="Search cards" />
          </div>

          <section class="overflow-hidden rounded-md border-2 border-ink bg-card shadow-hard" aria-label="Cards">
            <div
              class="flex gap-8 py-3.5 pl-6 pr-5 font-mono text-xs/4 font-medium text-muted-foreground max-sm:hidden"
              aria-hidden="true"
            >
              <span class="min-w-0 flex-1">Front</span>
              <span class="min-w-0 flex-1">Back</span>
            </div>
            <hr class="h-px border-0 bg-border max-sm:hidden" />

            <div v-if="shown.length === 0" class="flex flex-col items-center gap-2 px-6 py-14 text-center" role="status">
              <h2 class="max-w-full break-words text-lg/6 font-semibold">No cards match "{{ query.trim() }}"</h2>
              <p class="text-base text-muted-foreground">
                Check the spelling, or search for part of the question or answer.
              </p>
            </div>

            <ul v-else>
              <li v-for="(card, i) in shown" :key="card.id" :class="cn(i > 0 && 'border-t border-border')">
                <button
                  type="button"
                  :aria-pressed="card.id === selectedId"
                  :class="
                    cn(
                      'flex w-full items-stretch text-left outline-none hover:bg-background',
                      'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                      card.id === selectedId && 'bg-background',
                    )
                  "
                  @click="choose(card)"
                >
                  <span :class="cn('w-1 shrink-0', card.id === selectedId && 'bg-ink')" aria-hidden="true" />
                  <span class="flex min-w-0 flex-1 gap-x-8 gap-y-1 px-5 py-[18px] text-base/6 max-sm:flex-col">
                    <span class="line-clamp-2 min-w-0 flex-1 break-words text-foreground">{{ card.front }}</span>
                    <span
                      :class="
                        cn(
                          'line-clamp-2 min-w-0 flex-1 break-words text-muted-foreground',
                          card.id === selectedId && 'text-foreground',
                        )
                      "
                    >
                      {{ card.back }}
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>

        <CardEditor
          :card="selected"
          :pending="saving"
          :server-error="editError"
          :class="selected ? 'max-lg:order-first lg:sticky lg:top-6' : 'max-lg:hidden lg:sticky lg:top-6'"
          @save="save"
          @delete="openDelete"
        />
      </div>

      <DeleteCardDialog
        v-model:open="deleteOpen"
        :pending="deleting"
        :server-error="deleteError"
        @confirm="removeCard"
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
