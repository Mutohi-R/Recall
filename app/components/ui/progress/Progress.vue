<script setup lang="ts">
import type { ProgressRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { ProgressIndicator, ProgressRoot, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<ProgressRootProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})
const forwarded = useForwardProps(delegatedProps)
const indeterminate = computed(() => props.modelValue == null)
</script>

<template>
  <ProgressRoot
    data-slot="progress"
    v-bind="forwarded"
    :class="cn('relative h-2 w-full overflow-hidden rounded-md border-2 border-ink bg-muted', props.class)"
  >
    <ProgressIndicator
      data-slot="progress-indicator"
      :class="
        cn(
          'h-full w-full bg-primary transition-transform duration-300 motion-reduce:transition-none',
          'data-[state=indeterminate]:w-2/5 data-[state=indeterminate]:animate-[indeterminate_1.4s_ease-in-out_infinite] data-[state=indeterminate]:transition-none',
          'motion-reduce:data-[state=indeterminate]:animate-none',
        )
      "
      :style="indeterminate ? undefined : { transform: `translateX(-${100 - (modelValue ?? 0)}%)` }"
    />
  </ProgressRoot>
</template>