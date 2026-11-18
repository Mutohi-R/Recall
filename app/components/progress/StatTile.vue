<script setup lang="ts">
import type { StatTile } from "@/lib/progress"

defineProps<{ tile: StatTile }>()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2 rounded-md border-2 border-ink bg-card p-6 shadow-hard">
    <p class="font-mono text-xs text-muted-foreground">{{ tile.label }}</p>
    <p class="text-[40px]/[46px] font-semibold tracking-[-1px]">{{ tile.value }}</p>
    <p class="text-sm/5 text-muted-foreground">{{ tile.caption }}</p>
  </div>
</template>
