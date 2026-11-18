<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { X } from "@lucide/vue"
import { DialogClose } from "reka-ui"
import { cn } from "@/lib/utils"

// The title on the left and the close button on the right. Put a DialogTitle
// inside.
const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="dialog-header"
    :class="cn('flex items-center justify-between gap-4', props.class)"
  >
    <slot />
    <DialogClose
      aria-label="Close"
      class="inline-flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-md border-2 border-ink bg-card text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <X class="size-4" />
    </DialogClose>
  </div>
</template>