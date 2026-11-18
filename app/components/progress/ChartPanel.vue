<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <section class="flex min-w-0 flex-col gap-5 rounded-md border-2 border-ink bg-card p-7 shadow-hard">
    <header class="flex flex-col gap-1">
      <h2 class="text-lg/6 font-semibold">{{ title }}</h2>
      <p v-if="subtitle" class="text-sm/5 text-muted-foreground">{{ subtitle }}</p>
    </header>
    <slot />
  </section>
</template>
