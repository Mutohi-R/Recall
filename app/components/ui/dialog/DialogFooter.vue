<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

// The buttons, right-aligned. For the import dialog, give the first button
// class="mr-auto" to push it to the left edge.
const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="dialog-footer"
    :class="cn('flex flex-wrap items-center justify-end gap-3', props.class)"
  >
    <slot />
  </div>
</template>