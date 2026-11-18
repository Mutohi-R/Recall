<script setup lang="ts">
import type { DeckSummary } from "~~/lib/persistence/content"
import DeckTag from "@/components/DeckTag.vue"
import { deckColour } from "@/lib/deck-colours"
import { cardsLabel } from "@/lib/decks"

defineProps<{ deck: DeckSummary }>()
</script>

<template>
  <NuxtLink
    :to="`/decks/${deck.id}`"
    data-slot="deck-row"
    class="flex items-stretch rounded-md border-2 border-ink bg-card text-foreground shadow-hard outline-none transition-[translate,box-shadow] duration-100 ease-out hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
  >
    <span class="w-3.5 shrink-0" :style="{ backgroundColor: deckColour(deck.colour).fill }" aria-hidden="true" />
    <span class="flex min-w-0 flex-1 flex-col gap-1 px-6 py-5">
      <span class="truncate text-lg/6 font-semibold">{{ deck.name }}</span>
      <span class="font-mono text-xs/4 text-muted-foreground">{{ cardsLabel(deck.cardCount) }}</span>
    </span>
    <span class="flex shrink-0 items-center pr-6">
      <DeckTag v-if="deck.dueCount > 0" :name="`${deck.dueCount} due`" :colour="deck.colour" />
      <span v-else class="font-mono text-xs/4 text-muted-foreground">Nothing due</span>
    </span>
  </NuxtLink>
</template>