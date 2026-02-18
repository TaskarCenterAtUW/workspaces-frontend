<template>
  <div class="dropdown ms-auto">
    <button
      id="reviewSettingsBtn"
      type="button"
      class="btn btn-light btn-sm border"
      data-bs-toggle="dropdown"
      aria-haspopup="true"
      aria-expanded="false"
    >
      <app-icon variant="settings" no-margin />
      <span class="visually-hidden">Settings</span>
    </button>

    <div class="dropdown-menu dropdown-menu-end" aria-labelledby="reviewSettingsBtn">
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

      <div class="dropdown-divider" />

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
    </div><!-- .dropdown-menu -->
  </div><!-- .dropdown -->
</template>

<script setup lang="ts">
import type { ReviewListFilter } from '~/services/review';

const filter = defineModel<ReviewListFilter>({ required: true });
const emit = defineEmits(['apply']);

function apply() {
  emit('apply');
}
</script>
