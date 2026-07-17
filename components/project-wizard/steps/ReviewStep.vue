<!-- Instructions HTML is sanitized by buildProjectWizardReviewSummary before rendering. -->
<!-- eslint-disable vue/no-v-html -->
<template>
  <section class="project-wizard-step project-wizard-step-review">
    <header class="project-wizard-step-header">
      <h2 class="project-wizard-step-title">{{ step.title }}</h2>
      <p class="project-wizard-step-copy">{{ step.description }}</p>
    </header>

    <div class="project-wizard-review-group">
      <div class="project-wizard-review-item">
        <h3>Project Name</h3>
        <p>{{ summary.projectName }}</p>
      </div>

      <div class="project-wizard-review-item">
        <h3>Project Description</h3>
        <p>{{ summary.projectDescription }}</p>
      </div>

      <div class="project-wizard-review-item">
        <h3>Imagery URL</h3>
        <div class="project-wizard-review-status">
          <app-icon
            v-if="summary.hasImageryUrl"
            variant="check_circle"
            size="16"
            no-margin
          />
          <span>{{ summary.imageryStatusLabel }}</span>
        </div>
      </div>

      <div
        v-if="summary.numberOfTasksLabel"
        class="project-wizard-review-item"
      >
        <h3>Number of Tasks</h3>
        <p>{{ summary.numberOfTasksLabel }}</p>
      </div>

      <div class="project-wizard-review-item">
        <h3>Lock Timeout</h3>
        <p>{{ summary.lockTimeoutLabel }}</p>
      </div>

      <div class="project-wizard-review-item">
        <h3>Review Required</h3>
        <p>{{ summary.reviewRequiredLabel }}</p>
      </div>

      <div
        v-if="summary.selectedValidators.length > 0"
        class="project-wizard-review-item"
      >
        <h3>Project Validators</h3>
        <div class="project-wizard-review-validator-list">
          <div
            v-for="validator in summary.selectedValidators"
            :key="validator.authUid"
            class="project-wizard-review-validator"
          >
            <span class="project-wizard-review-validator-avatar">
              <app-icon
                variant="person"
                size="16"
                no-margin
              />
            </span>
            <span>{{ validator.displayName }}</span>
            <span class="project-wizard-review-validator-role">
              {{ formatRole(validator.role) }}
            </span>
          </div>
        </div>
      </div>

      <div class="project-wizard-review-item">
        <h3>Instructions</h3>
        <div
          v-if="summary.instructionsProvided"
          class="project-wizard-review-instructions project-wizard-rich-text-content"
          v-html="summary.instructionsHtml"
        />
        <p v-else>Not provided</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ProjectWizardReviewSummary } from '~/services/project-wizard-review';
import type { ProjectWizardReviewStepDefinition } from '~/types/project-wizard';
import type { WorkspaceRole } from '~/types/workspaces';

interface Props {
  step: ProjectWizardReviewStepDefinition;
  summary: ProjectWizardReviewSummary;
}

defineProps<Props>();

function formatRole(role: WorkspaceRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-step-review {
  display: grid;
  gap: 1.35rem;
}

.project-wizard-step-header {
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

.project-wizard-step-copy {
  margin: 0;
  color: rgba($secondary, 0.95);
  font-size: 0.95rem;
  line-height: 1.45;
}

.project-wizard-review-group {
  display: grid;
  gap: 1.25rem;
}

.project-wizard-review-item {
  display: grid;
  gap: 0.4rem;
}

.project-wizard-review-item h3 {
  margin: 0;
  text-align: left;
  font-family: Lato, var(--primary-font-family), sans-serif;
  font-size: 1.125rem;
  font-style: normal;
  font-weight: 600;
  line-height: 1.375rem;
  letter-spacing: 0;
  color: #1a1e3d;
  opacity: 1;
}

.project-wizard-review-item p {
  margin: 0;
  text-align: left;
  font-family: Lato, var(--primary-font-family), sans-serif;
  font-size: 1.125rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.625rem;
  letter-spacing: 0;
  color: #5a607b;
  opacity: 1;
}

.project-wizard-review-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  text-align: left;
  font-family: Lato, var(--primary-font-family), sans-serif;
  font-size: 1.125rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.625rem;
  letter-spacing: 0;
  color: #5a607b;
  opacity: 1;
}

.project-wizard-review-validator-list {
  display: grid;
  gap: 0.55rem;
}

.project-wizard-review-validator {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.55rem;
  color: #5a607b;
  font-family: Lato, var(--primary-font-family), sans-serif;
  font-size: 1.125rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.625rem;
}

.project-wizard-review-validator-avatar {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba($secondary, 0.9);
  background-color: rgba($primary, 0.04);
  border: 1px solid rgba($primary, 0.08);
  border-radius: 999px;
}

.project-wizard-review-validator-role {
  padding: 0.2rem 0.55rem;
  color: rgba($secondary, 0.96);
  font-size: 0.78rem;
  font-weight: 600;
  background-color: rgba($primary, 0.06);
  border: 1px solid rgba($primary, 0.12);
  border-radius: 999px;
}

.project-wizard-review-instructions {
  color: #5a607b;
  font-family: Lato, var(--primary-font-family), sans-serif;
  font-size: 1.125rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.625rem;
}
</style>
