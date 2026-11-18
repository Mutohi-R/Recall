<script setup lang="ts">
import { computed } from "vue"
import { Trash2 } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const props = withDefaults(
  defineProps<{
    deckName: string
    cardCount: number
    pending?: boolean
    serverError?: string
  }>(),
  { pending: false, serverError: "" },
)

const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{ confirm: [] }>()

const body = computed(() => {
  if (props.cardCount === 0) {
    return "The deck will be deleted. It disappears from your decks and from your reviews. Your review history is kept."
  }
  const cards = props.cardCount === 1 ? "1 card" : `${props.cardCount} cards`
  return `The deck and its ${cards} will be deleted. They disappear from your decks and from your reviews. Your review history is kept.`
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle class="break-words">Delete {{ deckName }}?</DialogTitle>
      </DialogHeader>
      <DialogDescription>{{ body }}</DialogDescription>
      <p v-if="serverError" role="alert" class="-mt-3 text-sm leading-5 text-destructive">
        {{ serverError }}
      </p>
      <DialogFooter>
        <DialogClose as-child>
          <Button type="button" variant="secondary" :disabled="pending">Cancel</Button>
        </DialogClose>
        <Button type="button" variant="danger" :disabled="pending" @click="emit('confirm')">
          <Trash2 />
          Delete deck
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>