<script setup lang="ts">
import type { LegendItem } from "@/lib/progress"

defineProps<{ items: LegendItem[] }>()
</script>

<template>
  <ul v-if="items.length" class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
    <li v-for="item in items" :key="item.key" class="flex items-center gap-1.5">
      <span class="size-3 border-[1.5px] border-ink" :style="{ backgroundColor: item.fill }" aria-hidden="true" />
      {{ item.name }}
    </li>
  </ul>
</template>
