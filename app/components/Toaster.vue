<script setup lang="ts">
import { cn } from "@/lib/utils"

const { message, tone } = useToast()
</script>

<template>
  <div class="pointer-events-none fixed bottom-12 left-4 z-50 sm:left-12" role="status" aria-live="polite">
    <p
      v-if="message"
      class="pointer-events-auto flex items-center gap-3 rounded-md border-2 border-ink bg-card px-4 py-3 font-mono text-xs/4 font-medium text-foreground shadow-hard"
    >
      <span
        v-if="tone"
        :class="cn('size-3.5 shrink-0 rounded-sm border-[1.5px] border-ink', tone === 'got' ? 'bg-recalled' : 'bg-missed')"
        aria-hidden="true"
      />
      {{ message }}
    </p>
  </div>
</template>
