<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <label
    data-slot="label"
    :class="cn('font-mono text-xs font-medium text-muted-foreground', props.class)"
  >
    <slot />
  </label>
</template>