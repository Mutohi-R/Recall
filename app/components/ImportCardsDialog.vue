<script setup lang="ts">
import { computed, ref, useId, watch } from "vue"
import { Upload } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import FormField from "@/components/FormField.vue"
import Notice from "@/components/Notice.vue"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  cardCountText,
  parseImportCards,
  type ImportCard,
  type ImportProblem,
} from "~~/lib/import-cards"

// The "Import cards" dialog (Figma: Dialog · Import cards). The learner pastes
// a JSON list or chooses a .json file. The text is checked as it changes: when
// it is good, the dialog says how many cards are ready; when it is not, the
// problems are shown after "Import" is pressed or a file is chosen. The parent
// owns the request.
const MAX_FILE_BYTES = 5 * 1024 * 1024

const EXAMPLE = JSON.stringify(
  [
    { front: "Which nerve supplies the muscles of facial expression?", back: "The facial nerve (VII)" },
    { front: "Which nerve carries taste from the front of the tongue?", back: "The chorda tympani, a branch of the facial nerve" },
    { front: "Which nerve controls the lateral rectus muscle?", back: "The abducens nerve (VI)" },
  ],
  null,
  2,
)

const props = withDefaults(
  defineProps<{
    deckName: string
    // True while the parent's request is running.
    pending?: boolean
    // A message from the server, shown as an error block.
    serverError?: string
  }>(),
  { pending: false, serverError: "" },
)

const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{ submit: [cards: ImportCard[]] }>()

const text = ref("")
const showErrors = ref(false)
const fileProblem = ref<ImportProblem | null>(null)
const textField = ref<{ $el: HTMLElement } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const noticeId = useId()

const parsed = computed(() => parseImportCards(text.value))
const readyCount = computed(() => (parsed.value.ok ? parsed.value.cards.length : 0))

// What the error block shows, if anything: a file that could not be read, the
// problems in the text, or a message from the server.
const problem = computed<ImportProblem | null>(() => {
  if (fileProblem.value) return fileProblem.value
  if (props.serverError) return { title: props.serverError, lines: [] }
  if (showErrors.value && !parsed.value.ok) return parsed.value.problem
  return null
})
const showReady = computed(() => !problem.value && parsed.value.ok)

watch(open, (isOpen) => {
  if (isOpen) {
    text.value = ""
    showErrors.value = false
    fileProblem.value = null
  }
})

// Typing hides the problems until the next try, and a new try is a fresh look.
watch(text, () => {
  showErrors.value = false
  fileProblem.value = null
})

async function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""
  if (!file) return
  if (file.size > MAX_FILE_BYTES) {
    fileProblem.value = {
      title: "That file is too large",
      lines: ["Choose a .json file smaller than 5 MB."],
    }
    return
  }
  try {
    const content = await file.text()
    text.value = content
    // The text watcher cleared the old problems; show the new ones at once.
    showErrors.value = true
  } catch {
    fileProblem.value = {
      title: "That file could not be read",
      lines: ["Choose it again, or paste the cards into the box."],
    }
  }
}

function onImport() {
  if (props.pending) return
  const result = parsed.value
  if (!result.ok) {
    showErrors.value = true
    textField.value?.$el.focus()
    return
  }
  emit("submit", result.cards)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>Import cards</DialogTitle>
      </DialogHeader>
      <DialogDescription>
        Paste a list of cards as JSON, or choose a .json file. Each card needs a front and a back of
        up to 2000 characters. The cards are added to {{ deckName }}.
      </DialogDescription>

      <FormField v-slot="field" label="Cards as JSON">
        <Textarea
          v-bind="field"
          ref="textField"
          v-model="text"
          :aria-invalid="problem ? 'true' : undefined"
          :aria-describedby="problem || showReady ? noticeId : undefined"
          :disabled="pending"
          :placeholder="EXAMPLE"
          spellcheck="false"
          class="h-56 font-mono text-xs leading-4"
        />
      </FormField>

      <Notice
        v-if="problem"
        :id="noticeId"
        variant="error"
        :title="problem.title"
        :lines="problem.lines"
      />
      <Notice
        v-else-if="showReady"
        :id="noticeId"
        variant="ok"
        :title="`${cardCountText(readyCount)} ${readyCount === 1 ? 'is' : 'are'} ready to import.`"
      />

      <DialogFooter>
        <Button type="button" variant="secondary" class="mr-auto" :disabled="pending" @click="fileInput?.click()">
          <Upload />
          Choose file
        </Button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          tabindex="-1"
          @change="onFileChosen"
        />
        <DialogClose as-child>
          <Button type="button" variant="secondary" :disabled="pending">Cancel</Button>
        </DialogClose>
        <Button type="button" :disabled="pending" @click="onImport">
          <Upload />
          {{ readyCount > 0 ? `Import ${cardCountText(readyCount)}` : "Import cards" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>