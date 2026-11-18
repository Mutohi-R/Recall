<script setup lang="ts">
import type { NuxtError } from "#app"
import { ArrowLeft } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { deckColour } from "@/lib/deck-colours"
import { errorPageContent } from "@/lib/errors"

const props = defineProps<{ error: NuxtError }>()

const content = computed(() => errorPageContent(props.error.statusCode))
const cards = computed(() =>
  content.value.digits.map((digit, i) => ({
    digit,
    fill: deckColour([0, 1, 3][i]!).fill,
    tilt: ["-rotate-5", "rotate-2 -translate-y-5", "rotate-4"][i],
  })),
)

useHead({ title: computed(() => `${content.value.title} · Recall`) })

const backToDecks = () => clearError({ redirect: "/" })
</script>

<template>
  <NuxtLayout name="default">
    <div class="flex min-h-[calc(100dvh-136px)] flex-col items-center justify-center gap-5 text-center">
      <p class="sr-only">Error {{ error.statusCode }}</p>
      <div class="flex h-[170px] items-center gap-4 sm:h-[290px] sm:gap-11" aria-hidden="true">
        <div
          v-for="(card, i) in cards"
          :key="i"
          :class="[
            'flex h-32 w-[100px] flex-col overflow-hidden rounded-md border-2 border-ink bg-card sm:h-56 sm:w-44',
            'shadow-[4px_4px_0_var(--ink)] sm:shadow-[6px_6px_0_var(--ink)]',
            card.tilt,
          ]"
        >
          <div class="h-3 shrink-0 border-b-2 border-ink sm:h-[18px]" :style="{ backgroundColor: card.fill }" />
          <div class="grid flex-1 place-items-center">
            <span class="text-[88px]/[92px] font-semibold tracking-[-3px] sm:text-[160px]/[168px] sm:tracking-[-4px]">
              {{ card.digit }}
            </span>
          </div>
        </div>
      </div>

      <h1 class="text-balance text-[32px]/[38px] font-semibold">{{ content.title }}</h1>
      <p class="max-w-[520px] text-base text-muted-foreground">{{ content.body }}</p>
      <Button type="button" @click="backToDecks"><ArrowLeft />Back to decks</Button>
    </div>
  </NuxtLayout>
</template>
