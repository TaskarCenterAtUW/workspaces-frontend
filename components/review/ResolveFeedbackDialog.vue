<template>
  <b-modal
    v-model="show"
    title="Resolve Feedback"
    ok-title="Mark as Resolved"
    ok-variant="success"
    :ok-disabled="busy"
    :cancel-disabled="busy"
    @ok.prevent="submit"
    @hidden="reset"
  >
    <fieldset class="mb-3">
      <legend class="form-label fs-6">
        Resolution
      </legend>
      <div
        v-for="option in RESOLUTIONS"
        :key="option.value"
        class="form-check"
      >
        <input
          :id="`resolve-feedback-${option.value}`"
          v-model="resolution"
          class="form-check-input"
          type="radio"
          name="resolve-feedback-resolution"
          :value="option.value"
          :disabled="busy"
        >
        <label
          class="form-check-label"
          :for="`resolve-feedback-${option.value}`"
        >{{ option.label }}</label>
      </div>
    </fieldset>
    <label
      class="form-label"
      for="resolve-feedback-description"
    >Note (optional)</label>
    <textarea
      id="resolve-feedback-description"
      v-model="description"
      class="form-control"
      rows="3"
      :disabled="busy"
    />
  </b-modal>
</template>

<script setup lang="ts">
// @test unit: choosing a resolution and confirming emits resolve with it and the note (blank notes left out)
// @test unit: the resolution defaults to "fixed", and the form resets when the dialog closes

import type { TdeiFeedbackResolution } from '~/types/tdei';

/** Asks how a TDEI dataset-viewer feedback item was resolved. */
const show = defineModel<boolean>({ default: false });
defineProps<{
  /** While the resolution is being saved. */
  busy?: boolean;
}>();
const emit = defineEmits<{
  resolve: [{ resolution: TdeiFeedbackResolution; description?: string }];
}>();

const RESOLUTIONS: { value: TdeiFeedbackResolution; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'wont_fix', label: 'Won\'t fix' },
  { value: 'not_an_issue', label: 'Not an issue' }
];

const resolution = ref<TdeiFeedbackResolution>('fixed');
const description = ref('');

function submit() {
  const note = description.value.trim();
  emit('resolve', { resolution: resolution.value, ...(note ? { description: note } : {}) });
}

function reset() {
  resolution.value = 'fixed';
  description.value = '';
}
</script>
