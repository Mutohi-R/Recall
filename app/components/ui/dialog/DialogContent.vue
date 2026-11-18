<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { DialogContent, DialogOverlay, DialogPortal, useForwardPropsEmits } from "reka-ui"
import { cn } from "@/lib/utils"

// The dialog panel on its scrim (Figma: Dialog). size picks the panel width:
// sm 520px for deck forms and delete questions, md 560px for card forms,
// lg 640px for importing cards.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<DialogContentProps & { class?: HTMLAttributes["class"]; size?: "sm" | "md" | "lg" }>(),
  { size: "sm" },
)
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, "class", "size")
const forwarded = useForwardPropsEmits(delegatedProps, emits)

const widths = { sm: "w-[520px]", md: "w-[560px]", lg: "w-[640px]" }

// Focus the first field when the dialog opens. Without a field (a delete
// question), the browser's default applies.
function onOpenAutoFocus(event: Event) {
  const panel = (event.currentTarget ?? event.target) as HTMLElement | null
  const field = panel?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled])")
  if (field) {
    event.preventDefault()
    field.focus()
  }
}
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      data-slot="dialog-overlay"
      class="fixed inset-0 z-50 bg-ink/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150 motion-reduce:animate-none"
    />
    <DialogContent
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-md border-2 border-ink bg-card px-8 py-7 shadow-hard outline-none',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150 motion-reduce:animate-none',
          widths[size],
          props.class,
        )
      "
      @open-auto-focus="onOpenAutoFocus"
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>