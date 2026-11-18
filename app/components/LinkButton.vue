<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

// A button that looks like a text link (Figma: Link): underlined ink text. Use
// it for actions that change the screen, not for going to another page.
const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <button
    type="button"
    data-slot="link-button"
    :class="
      cn(
        'cursor-pointer rounded-sm text-sm leading-5 text-foreground underline outline-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </button>
</template>