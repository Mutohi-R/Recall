<script setup lang="ts">
import { ref, watch } from "vue"
import { Check, Plus } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

const MAX_NAME = 100

const props = withDefaults(
  defineProps<{
    mode: "create" | "edit"
    initialName?: string
    pending?: boolean
    serverError?: string
  }>(),
  { initialName: "", pending: false, serverError: "" },
)

const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{ submit: [name: string] }>()

const name = ref(props.initialName)
const localError = ref("")

watch(open, (isOpen) => {
  if (isOpen) {
    name.value = props.initialName
    localError.value = ""
  }
})

watch(name, () => {
  localError.value = ""
})

function onSubmit() {
  if (props.pending) return
  const trimmed = name.value.trim()
  if (!trimmed) {
    localError.value = "Deck name is required"
    return
  }
  emit("submit", trimmed)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <form class="flex flex-col gap-6" novalidate @submit.prevent="onSubmit">
        <DialogHeader>
          <DialogTitle>{{ mode === "create" ? "New deck" : "Edit deck" }}</DialogTitle>
        </DialogHeader>
        <DialogDescription class="sr-only">
          {{ mode === "create" ? "Give the new deck a name." : "Change the name of this deck." }}
        </DialogDescription>

        <!-- The server could not save the deck (Figma: New deck, save failed) -->
        <Notice v-if="serverError" variant="error" :lines="[serverError]" />

        <FormField v-slot="field" label="Name" :count="name.length" :max="MAX_NAME" :error="localError">
          <Input
            v-bind="field"
            v-model="name"
            :maxlength="MAX_NAME"
            :disabled="pending"
            placeholder="For example, Cranial nerves"
            autocomplete="off"
          />
        </FormField>

        <DialogFooter>
          <DialogClose as-child>
            <Button type="button" variant="secondary" :disabled="pending">Cancel</Button>
          </DialogClose>
          <Button type="submit" :disabled="pending">
            <Plus v-if="mode === 'create'" />
            <Check v-else />
            {{ mode === "create" ? "Create deck" : "Save changes" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>