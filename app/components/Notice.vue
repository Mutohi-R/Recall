<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = withDefaults(
  defineProps<{
    variant: "ok" | "error"
    title?: string
    lines?: string[]
    class?: HTMLAttributes["class"]
  }>(),
  { lines: () => [] },
)
</script>

<template>
  <div
    data-slot="notice"
    :role="variant === 'error' ? 'alert' : 'status'"
    :class="
      cn(
        'flex flex-col gap-1 rounded-md border-2 px-3.5 py-3 text-foreground',
        variant === 'ok' ? 'border-ink bg-recalled' : 'border-destructive bg-missed',
        props.class,
      )
    "
  >
    <p v-if="title" class="text-base leading-6">{{ title }}</p>
    <p v-for="(line, i) in lines" :key="i" class="text-sm leading-5">{{ line }}</p>
  </div>
</template>