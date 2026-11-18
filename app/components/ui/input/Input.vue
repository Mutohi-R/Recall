<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()

const modelValue = defineModel<string | number>()
</script>

<template>
  <input
    v-model="modelValue"
    data-slot="input"
    :class="
      cn(
        'h-13 w-full min-w-0 rounded-md border-2 border-input bg-card px-3.5 py-3 text-base leading-6 text-foreground',
        'placeholder:text-muted-foreground outline-none',
        'focus-visible:border-primary',
        'aria-invalid:border-destructive',
        'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground',
        props.class,
      )
    "
  />
</template>