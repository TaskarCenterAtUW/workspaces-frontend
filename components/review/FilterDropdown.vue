<template>
  <b-dropdown
    class="ms-auto"
    toggle-class="border"
    variant="light"
    size="sm"
    placement="bottom-end"
    auto-close="outside"
    no-caret
  >
    <template #button-content>
      <app-icon variant="settings" no-margin />
      <span class="visually-hidden">Settings</span>
    </template>

    <div class="px-3 py-2">
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeChangesets"
            type="checkbox"
            class="form-check-input"
          />
          Changesets
        </label>
      </div>
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeFeedback"
            type="checkbox"
            class="form-check-input"
          />
          Feedback
        </label>
      </div>
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeNotes"
            type="checkbox"
            class="form-check-input"
          />
          Notes
        </label>
      </div>
    </div>

    <b-dropdown-divider />

    <div class="px-3 py-2">
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeResolved"
            type="checkbox"
            class="form-check-input"
          />
          Show Resolved
        </label>
      </div>
    </div>

    <div class="dropdown-divider" />

    <div class="px-3 py-2">
      <button class="d-block btn btn-primary btn-sm" @click="apply">Apply</button>
    </div>
  </b-dropdown>
</template>

<script setup lang="ts">
import type { ReviewListFilter } from '~/services/review';

const filter = defineModel<ReviewListFilter>({ required: true });
const emit = defineEmits(['apply']);

function apply() {
  emit('apply');
}
</script>
