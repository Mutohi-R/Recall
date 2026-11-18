<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

// The white card the sign-in screens sit in (Figma: Sign in / Card): a heading
// with an optional line under it, then whatever the screen needs.
const props = defineProps<{
  title: string
  subtitle?: string
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <section
    data-slot="auth-card"
    :class="
      cn(
        'flex w-[440px] max-w-full flex-col gap-6 rounded-md border-2 border-ink bg-card p-9 shadow-hard',
        props.class,
      )
    "
  >
    <div class="flex flex-col gap-2">
      <h1 class="text-[32px]/[38px] font-semibold text-foreground">{{ title }}</h1>
      <p v-if="subtitle" class="break-words text-base text-muted-foreground">{{ subtitle }}</p>
    </div>
    <slot />
  </section>
</template>