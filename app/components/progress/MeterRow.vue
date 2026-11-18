<script setup lang="ts">
const props = defineProps<{
  name: string
  description: string
  value: string
  // 0 to 1
  share: number
  fill: string
  label: string
}>()

const percent = computed(() => Math.round(Math.min(1, Math.max(0, props.share)) * 100))
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-start justify-between gap-4">
      <div class="flex min-w-0 flex-col">
        <p class="text-base/6">{{ name }}</p>
        <p class="text-sm/5 text-muted-foreground">{{ description }}</p>
      </div>
      <p class="shrink-0 text-base/6 font-semibold">{{ value }}</p>
    </div>
    <div
      role="meter"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="percent"
      :aria-valuetext="value"
      class="h-3.5 overflow-hidden rounded-full border-2 border-ink bg-muted"
    >
      <div class="h-full" :style="{ width: `${percent}%`, backgroundColor: fill }" />
    </div>
  </div>
</template>
