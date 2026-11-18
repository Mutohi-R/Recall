<script setup lang="ts">
import { computed, ref, useId, watch } from "vue"
import { Check } from "@lucide/vue"
import { Button } from "@/components/ui/button"
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
    question: string
    initialAnswer: string
    pending?: boolean
    serverError?: string
  }>(),
  { pending: false, serverError: "" },
)

const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{ submit: [answer: string] }>()

const answer = ref(props.initialAnswer)
const localError = ref("")
const questionLabelId = useId()

watch(open, (isOpen) => {
  if (isOpen) {
    answer.value = props.initialAnswer
    localError.value = ""
  }
})
watch(answer, () => (localError.value = ""))

const error = computed(
  () =>
    localError.value ||
    (answer.value.length >= MAX_TEXT ? `The answer is limited to ${MAX_TEXT} characters.` : "") ||
    props.serverError,
)

function onSubmit() {
  if (props.pending) return
  const trimmed = answer.value.trim()
  if (!trimmed) {
    localError.value = "Answer is required"
    return
  }
  emit("submit", trimmed)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent size="md">
      <form class="flex flex-col gap-6" novalidate @submit.prevent="onSubmit">
        <DialogHeader>
          <DialogTitle>Edit answer</DialogTitle>
        </DialogHeader>
        <DialogDescription class="sr-only">
          Change the answer on this card. The question stays as it is.
        </DialogDescription>

        <div role="group" :aria-labelledby="questionLabelId" class="flex flex-col gap-2">
          <span :id="questionLabelId" class="font-mono text-xs font-medium text-muted-foreground">
            Question
          </span>
          <p class="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted px-3.5 py-3 text-base leading-6 text-muted-foreground">
            {{ question }}
          </p>
        </div>

        <FormField v-slot="field" label="Answer" :count="answer.length" :max="MAX_TEXT" :error="error">
          <Textarea
            v-bind="field"
            v-model="answer"
            :maxlength="MAX_TEXT"
            :disabled="pending"
            placeholder="The answer"
          />
        </FormField>

        <DialogFooter>
          <DialogClose as-child>
            <Button type="button" variant="secondary" :disabled="pending">Cancel</Button>
          </DialogClose>
          <Button type="submit" :disabled="pending">
            <Check />
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>