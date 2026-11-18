<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed, useId } from 'vue';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

//   <FormField label="Name" :count="name.length" :max="100" :error="nameError" v-slot="field">
//     <Input v-model="name" v-bind="field" />
//   </FormField>

const props = defineProps<{
  label: string;
  count?: number;
  max?: number;
  error?: string;
  class?: HTMLAttributes['class'];
}>();

const uid = useId();
const errorId = `${uid}-error`;

const showCounter = computed(
  () => props.count !== undefined && props.max !== undefined,
);

const atLimit = computed(() => showCounter.value && props.count! >= props.max!);

const control = computed(() => ({
  id: uid,
  'aria-invalid': props.error ? ('true' as const) : undefined,
  'aria-describedby': props.error ? errorId : undefined,
}));
</script>

<template>
  <div data-slot="form-field" :class="cn('flex flex-col gap-2', props.class)">
    <div class="flex items-baseline justify-between">
      <Label :for="uid">{{ label }}</Label>
      <span
        v-if="showCounter"
        :class="
          cn(
            'font-mono text-xs text-muted-foreground',
            atLimit && 'text-destructive',
          )
        "
      >
        {{ count }} / {{ max }}
      </span>
    </div>
    <slot v-bind="control" />
    <p
      v-if="error"
      :id="errorId"
      role="alert"
      class="text-sm leading-5 text-destructive"
    >
      {{ error }}
    </p>
  </div>
</template>
