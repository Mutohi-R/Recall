<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{ class?: HTMLAttributes["class"] }>()
</script>

<template>
  <div data-slot="skeleton" aria-hidden="true" :class="cn('rounded-md bg-muted motion-safe:animate-pulse', props.class)" />
</template>