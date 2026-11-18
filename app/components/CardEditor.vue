<script setup lang="ts">
import type { CardRecord } from "~~/lib/persistence/content"
import { computed, reactive, ref, watch } from "vue"
import { Check, Trash2 } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import FormField from "@/components/FormField.vue"
import {
  MAX_CARD_TEXT,
  addedText,
  cardLimitMessage,
  cardRequiredMessage,
  type CardSide,
} from "@/lib/cards"


const props = withDefaults(
  defineProps<{
    card: CardRecord | null
    pending?: boolean
    serverError?: string
  }>(),
  { pending: false, serverError: "" },
)

const emit = defineEmits<{
  save: [changes: { front?: string; back?: string }]
  delete: []
}>()

const front = ref(props.card?.front ?? "")
const back = ref(props.card?.back ?? "")
const required = reactive<Record<CardSide, boolean>>({ front: false, back: false })

// A different card, or its text changed by a save: start from what is stored.
watch(
  () => [props.card?.id, props.card?.front, props.card?.back],
  () => {
    front.value = props.card?.front ?? ""
    back.value = props.card?.back ?? ""
    required.front = required.back = false
  },
)
watch(front, () => (required.front = false))
watch(back, () => (required.back = false))

const changed = computed(
  () => !!props.card && (front.value.trim() !== props.card.front || back.value.trim() !== props.card.back),
)

function error(side: CardSide, text: string): string {
  if (required[side]) return cardRequiredMessage(side)
  return text.length >= MAX_CARD_TEXT ? cardLimitMessage(side) : ""
}
const frontError = computed(() => error("front", front.value))
const backError = computed(() => error("back", back.value))

function save() {
  if (!props.card || props.pending || !changed.value) return
  required.front = front.value.trim() === ""
  required.back = back.value.trim() === ""
  if (required.front || required.back) return
  const changes: { front?: string; back?: string } = {}
  if (front.value.trim() !== props.card.front) changes.front = front.value.trim()
  if (back.value.trim() !== props.card.back) changes.back = back.value.trim()
  emit("save", changes)
}
</script>

<template>
  <section
    v-if="!card"
    class="flex flex-col items-center gap-5 rounded-md border-2 border-ink bg-card px-6 py-16 text-center shadow-hard"
  >
    <h2 class="text-lg/6 font-semibold">Select a card to edit it</h2>
    <p class="max-w-[340px] text-base text-muted-foreground">
      Click any row in the list. You can change the front and the back, or delete the card.
    </p>
  </section>

  <form
    v-else
    novalidate
    class="flex flex-col gap-5 rounded-md border-2 border-ink bg-card p-6 shadow-hard"
    @submit.prevent="save"
  >
    <h2 class="text-lg/6 font-semibold">Edit card</h2>
    <FormField v-slot="field" label="Front" :count="front.length" :max="MAX_CARD_TEXT" :error="frontError">
      <Textarea v-bind="field" v-model="front" class="h-24" :maxlength="MAX_CARD_TEXT" :disabled="pending" />
    </FormField>
    <FormField v-slot="field" label="Back" :count="back.length" :max="MAX_CARD_TEXT" :error="backError">
      <Textarea v-bind="field" v-model="back" class="h-24" :maxlength="MAX_CARD_TEXT" :disabled="pending" />
    </FormField>
    <p v-if="serverError" role="alert" class="-mt-2 text-sm leading-5 text-destructive">{{ serverError }}</p>
    <div class="flex flex-wrap gap-3">
      <Button type="submit" :disabled="pending || !changed"><Check />Save changes</Button>
      <Button type="button" variant="secondary" :disabled="pending" @click="emit('delete')">
        <Trash2 />Delete card
      </Button>
    </div>
    <p class="font-mono text-xs/4 text-muted-foreground">{{ addedText(card.createdAt, new Date()) }}</p>
  </form>
</template>
