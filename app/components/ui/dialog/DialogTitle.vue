<script setup lang="ts">
import type { DialogTitleProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { DialogTitle } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes["class"] }>()
const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <DialogTitle
    data-slot="dialog-title"
    v-bind="delegatedProps"
    :class="cn('min-w-0 text-2xl/[30px] font-semibold text-foreground', props.class)"
  >
    <slot />
  </DialogTitle>
</template>