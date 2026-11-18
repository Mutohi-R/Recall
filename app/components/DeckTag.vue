<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"
import { deckColour } from "@/lib/deck-colours"

const props = defineProps<{
  name: string
  colour: number
  class?: HTMLAttributes["class"]
}>()

const fill = computed(() => deckColour(props.colour).fill)
</script>

<template>
  <span
    data-slot="deck-tag"
    :class="
      cn(
        'inline-flex max-w-full items-center rounded-md border-[1.5px] border-ink px-1.5 py-0.5 font-mono text-xs font-medium text-foreground',
        props.class,
      )
    "
    :style="{ backgroundColor: fill }"
  >
    <span class="truncate">{{ name }}</span>
  </span>
</template>