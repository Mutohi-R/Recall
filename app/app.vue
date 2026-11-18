<template>
  <div class="flex flex-wrap gap-4 p-8">
    <Button><Play /> Start review</Button>
    <Button variant="secondary"><Plus /> New deck</Button>
    <Button variant="danger"><Trash2 /> Delete deck</Button>
    <Button variant="missed">Missed it</Button>
    <Button variant="got">Got it</Button>
    <Button disabled>Disabled</Button>
  </div>
  <div class="flex flex-wrap gap-3 p-8">
    <DeckTag v-for="i in 12" :key="i" name="Cranial nerves" :colour="i - 1" />
  </div>
  <div class="flex w-[420px] flex-col gap-4 p-8">
    <div class="flex flex-col gap-2">
      <Label for="name">Name</Label>
      <Input id="name" v-model="name" placeholder="For example, Cranial nerves" />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="bad">Error</Label>
      <Input id="bad" aria-invalid="true" placeholder="Deck name" />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="front">Front</Label>
      <Textarea id="front" placeholder="The question" />
    </div>
    <Input disabled model-value="Saving…" />
  </div>
</template>

<script setup lang="ts">
const name = ref('')
import { Play, Plus, Trash2 } from '@lucide/vue';
</script>
