<template>
  <section class="project-wizard-step project-wizard-step-settings">
    <header class="project-wizard-step-header">
      <h2 class="project-wizard-step-title">{{ step.title }}</h2>
      <p class="project-wizard-step-copy">{{ step.description }}</p>
    </header>

    <section class="project-wizard-settings-section">
      <div class="project-wizard-settings-row">
        <div class="project-wizard-settings-copy">
          <h3 class="project-wizard-settings-heading">Lock Timeout</h3>
          <p class="project-wizard-settings-text">Project will be locked for specific hours</p>
        </div>

        <div class="project-wizard-settings-lock-control">
          <label class="visually-hidden" :for="lockTimeoutId">Lock timeout in hours</label>
          <select
            :id="lockTimeoutId"
            class="form-select project-wizard-settings-select"
            :value="lockTimeoutHours"
            @change="onLockTimeoutChange"
          >
            <option
              v-for="hourOption in hourOptions"
              :key="hourOption"
              :value="hourOption"
            >
              {{ String(hourOption).padStart(2, '0') }}
            </option>
          </select>
          <span class="project-wizard-settings-select-suffix">hours</span>
        </div>
      </div>
    </section>

    <section class="project-wizard-settings-section">
      <div class="project-wizard-settings-row">
        <div class="project-wizard-settings-copy">
          <h3 class="project-wizard-settings-heading">Review Required</h3>
          <p class="project-wizard-settings-text">Require a validator review before tasks can be completed.</p>
        </div>

        <label class="project-wizard-settings-switch">
          <input
            class="project-wizard-settings-switch-input"
            type="checkbox"
            :checked="reviewRequired"
            @change="onReviewRequiredChange"
          >
          <span class="project-wizard-settings-switch-track" />
          <span class="visually-hidden">Toggle review requirement</span>
        </label>
      </div>
    </section>

    <section class="project-wizard-settings-section">
      <div class="project-wizard-settings-copy">
        <h3 class="project-wizard-settings-heading">Assign Validators</h3>
      </div>

      <project-wizard-assign-users-field
        :error="workspaceUsersError"
        :loading="workspaceUsersLoading"
        :search-query="validatorSearchQuery"
        :search-results="workspaceUsers"
        :selected-users="selectedValidators"
        @add:user="emit('add:validator', $event)"
        @remove:user="emit('remove:validator', $event)"
        @retry="emit('retry:workspace-users')"
        @update:search="emit('update:validator-search', $event)"
      />
    </section>

    <section class="project-wizard-settings-section">
      <div class="project-wizard-settings-copy">
        <h3 class="project-wizard-settings-heading">Instructions</h3>
      </div>

      <client-only fallback-tag="div">
        <project-wizard-rich-text-editor
          :model-value="instructions"
          @update:model-value="emit('update:instructions', $event)"
        />
      </client-only>
    </section>
  </section>
</template>

<script setup lang="ts">
import type {
  ProjectWizardSettingsStepDefinition,
  ProjectWizardWorkspaceUser,
} from '~/types/project-wizard';

interface Props {
  instructions: string;
  lockTimeoutHours: number;
  reviewRequired: boolean;
  selectedValidators: ProjectWizardWorkspaceUser[];
  step: ProjectWizardSettingsStepDefinition;
  validatorSearchQuery: string;
  workspaceUsers: ProjectWizardWorkspaceUser[];
  workspaceUsersError?: string | null;
  workspaceUsersLoading: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'add:validator': [user: ProjectWizardWorkspaceUser];
  'remove:validator': [userId: string];
  'retry:workspace-users': [];
  'update:instructions': [value: string];
  'update:lock-timeout-hours': [value: number];
  'update:review-required': [value: boolean];
  'update:validator-search': [value: string];
}>();

const lockTimeoutId = 'project-wizard-settings-lock-timeout';
const hourOptions = Array.from({ length: 24 }, (_, index) => index + 1);

function onLockTimeoutChange(event: Event) {
  emit('update:lock-timeout-hours', Number((event.target as HTMLSelectElement).value));
}

function onReviewRequiredChange(event: Event) {
  emit('update:review-required', (event.target as HTMLInputElement).checked);
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-step-settings {
  display: grid;
  gap: 1.4rem;
}

.project-wizard-step-header,
.project-wizard-settings-copy {
  display: grid;
  gap: 0.25rem;
}

.project-wizard-step-title {
  margin: 0;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.15;
  text-transform: uppercase;
}

.project-wizard-step-copy,
.project-wizard-settings-text {
  margin: 0;
  color: rgba($secondary, 0.95);
  font-size: 0.95rem;
  line-height: 1.45;
}

.project-wizard-settings-section {
  display: grid;
  gap: 0.8rem;
}

.project-wizard-settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.project-wizard-settings-heading {
  margin: 0;
  color: $text-navy;
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.3;
}

.project-wizard-settings-lock-control {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: stretch;
}

.project-wizard-settings-select {
  min-width: 4.6rem;
  border-radius: 0.45rem 0 0 0.45rem;
}

.project-wizard-settings-select-suffix {
  min-width: 3.6rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba($secondary, 0.98);
  font-size: 0.9rem;
  background-color: rgba($text-navy, 0.04);
  border: 1px solid rgba($text-navy, 0.12);
  border-left: 0;
  border-radius: 0 0.45rem 0.45rem 0;
}

.project-wizard-settings-switch {
  position: relative;
  width: 3rem;
  height: 1.75rem;
  display: inline-flex;
  flex: 0 0 auto;
}

.project-wizard-settings-switch-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.project-wizard-settings-switch-track {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: rgba($secondary, 0.2);
  border-radius: 999px;
  transition: background-color 0.18s ease;
}

.project-wizard-settings-switch-track::after {
  content: "";
  position: absolute;
  top: 0.16rem;
  left: 0.16rem;
  width: 1.43rem;
  height: 1.43rem;
  background-color: #fff;
  border-radius: 999px;
  box-shadow: 0 0.12rem 0.4rem rgba($text-navy, 0.16);
  transition: transform 0.18s ease;
}

.project-wizard-settings-switch-input:checked + .project-wizard-settings-switch-track {
  background-color: rgba($primary, 0.84);
}

.project-wizard-settings-switch-input:checked + .project-wizard-settings-switch-track::after {
  transform: translateX(1.25rem);
}

@include media-breakpoint-down(md) {
  .project-wizard-settings-row {
    flex-direction: column;
    align-items: stretch;
  }

  .project-wizard-settings-lock-control {
    align-self: flex-start;
  }
}
</style>
