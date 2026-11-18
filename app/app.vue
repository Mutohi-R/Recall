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
</template>

<script setup lang="ts">
import { Play, Plus, Trash2 } from '@lucide/vue';
</script>
