<script setup lang="ts">
import { computed, nextTick, reactive, ref, useId, watch } from "vue"
import { Plus } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import FormField from "@/components/FormField.vue"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const MAX_TEXT = 2000

const props = withDefaults(
  defineProps<{
    // True while the parent's request is running.
    pending?: boolean
    // A message from the server, shown above the buttons.
    serverError?: string
  }>(),
  { pending: false, serverError: "" },
)

const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{
  submit: [card: { front: string; back: string; addAnother: boolean }]
}>()

const front = ref("")
const back = ref("")
const addAnother = ref(true)
const errors = reactive({ front: "", back: "" })

const frontField = ref<{ $el: HTMLElement } | null>(null)
const backField = ref<{ $el: HTMLElement } | null>(null)
const checkboxId = useId()

const frontError = computed(
  () =>
    errors.front ||
    (front.value.length >= MAX_TEXT ? `The front is limited to ${MAX_TEXT} characters.` : ""),
)
const backError = computed(
  () =>
    errors.back ||
    (back.value.length >= MAX_TEXT ? `The back is limited to ${MAX_TEXT} characters.` : ""),
)

watch(front, () => (errors.front = ""))
watch(back, () => (errors.back = ""))

watch(open, (isOpen) => {
  if (isOpen) clear()
})

function clear() {
  front.value = ""
  back.value = ""
  errors.front = ""
  errors.back = ""
}

function reset() {
  clear()
  nextTick(() => frontField.value?.$el.focus())
}
defineExpose({ reset })

function onSubmit() {
  if (props.pending) return
  const f = front.value.trim()
  const b = back.value.trim()
  errors.front = f ? "" : "Front is required"
  errors.back = b ? "" : "Back is required"
  if (!f) return frontField.value?.$el.focus()
  if (!b) return backField.value?.$el.focus()
  emit("submit", { front: f, back: b, addAnother: addAnother.value })
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent size="md">
      <form class="flex flex-col gap-6" novalidate @submit.prevent="onSubmit">
        <DialogHeader>
          <DialogTitle>Add card</DialogTitle>
        </DialogHeader>
        <DialogDescription class="sr-only">
          Write the question for the front of the card and the answer for the back.
        </DialogDescription>

        <FormField v-slot="field" label="Front" :count="front.length" :max="MAX_TEXT" :error="frontError">
          <Textarea
            v-bind="field"
            ref="frontField"
            v-model="front"
            :maxlength="MAX_TEXT"
            :disabled="pending"
            placeholder="The question"
          />
        </FormField>

        <FormField v-slot="field" label="Back" :count="back.length" :max="MAX_TEXT" :error="backError">
          <Textarea
            v-bind="field"
            ref="backField"
            v-model="back"
            :maxlength="MAX_TEXT"
            :disabled="pending"
            placeholder="The answer"
          />
        </FormField>

        <div class="flex items-center gap-2.5">
          <Checkbox :id="checkboxId" v-model="addAnother" :disabled="pending" />
          <Label :for="checkboxId" class="cursor-pointer font-sans text-base font-normal text-foreground">
            Add another card after this one
          </Label>
        </div>

        <p v-if="serverError" role="alert" class="-mt-3 text-sm leading-5 text-destructive">
          {{ serverError }}
        </p>

        <DialogFooter>
          <DialogClose as-child>
            <Button type="button" variant="secondary" :disabled="pending">Cancel</Button>
          </DialogClose>
          <Button type="submit" :disabled="pending">
            <Plus />
            Add card
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>