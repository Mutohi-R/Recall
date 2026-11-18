<script setup lang="ts">
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

withDefaults(
  defineProps<{
    pending?: boolean
    serverError?: string
  }>(),
  { pending: false, serverError: "" },
)

const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete this card?</DialogTitle>
      </DialogHeader>
      <DialogDescription>
        The card will be deleted. It disappears from your cards and from your reviews. Your review history is kept.
      </DialogDescription>
      <p v-if="serverError" role="alert" class="-mt-3 text-sm leading-5 text-destructive">
        {{ serverError }}
      </p>
      <DialogFooter>
        <DialogClose as-child>
          <Button type="button" variant="secondary" :disabled="pending">Cancel</Button>
        </DialogClose>
        <Button type="button" variant="danger" :disabled="pending" @click="emit('confirm')">
          <Trash2 />
          Delete card
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>