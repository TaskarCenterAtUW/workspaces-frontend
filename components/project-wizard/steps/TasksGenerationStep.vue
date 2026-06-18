<template>
  <section class="project-wizard-step project-wizard-step-tasks">
    <header class="project-wizard-step-header">
      <h2 class="project-wizard-step-title">{{ step.title }}</h2>
      <p class="project-wizard-step-copy">{{ step.description }}</p>
    </header>

    <section class="project-wizard-tasks-project-created" aria-live="polite">
      <app-icon variant="check_circle" size="18" no-margin />
      <div class="project-wizard-tasks-project-created-copy">
        <strong>Project created successfully</strong>
        <p>
          <span v-if="createdProjectName">“{{ createdProjectName }}” is now saved as a draft.</span>
          Generate tasks to complete the setup.
        </p>
      </div>
    </section>

    <section class="project-wizard-tasks-callout" aria-live="polite">
      <app-icon variant="info" size="18" no-margin />
      <p class="project-wizard-tasks-callout-copy">
        Set the task area between <strong>{{ formattedMinimumTaskArea }} km2</strong> to
        <strong>{{ formattedMaximumTaskArea }} km2</strong> and click generate tasks.
      </p>
    </section>

    <div class="project-wizard-tasks-range-block">
      <div class="project-wizard-tasks-range-header">
        <label class="project-wizard-label" :for="rangeInputId">Set task area</label>
        <strong class="project-wizard-tasks-range-value">{{ formattedTaskArea }} km2.</strong>
      </div>

      <input
        :id="rangeInputId"
        class="project-wizard-tasks-range"
        type="range"
        :min="minimumTaskAreaSquareKilometers"
        :max="maximumTaskAreaSquareKilometers"
        :step="taskAreaStep"
        :value="taskAreaSquareKilometers"
        @input="onTaskAreaInput"
      >

      <p class="project-wizard-tasks-range-copy">
        Each task will be generated for <strong>{{ formattedTaskArea }} km2</strong>
      </p>
    </div>

    <div class="project-wizard-tasks-actions">
      <button
        class="btn btn-outline-secondary project-wizard-tasks-action"
        type="button"
        :disabled="!canGenerate || generating"
        @click="emit('generate')"
      >
        <app-spinner v-if="generating" size="sm" />
        <template v-else>
          <app-icon variant="grid_view" size="18" no-margin />
          Generate Tasks
        </template>
      </button>

      <button
        class="btn btn-outline-secondary project-wizard-tasks-action project-wizard-tasks-action-reset"
        type="button"
        :disabled="generating"
        @click="emit('reset')"
      >
        <app-icon variant="refresh" size="18" no-margin />
        Reset
      </button>
    </div>

    <section
      v-if="generatedSummary"
      class="project-wizard-tasks-success"
      aria-live="polite"
    >
      <div class="project-wizard-tasks-success-title">
        <app-icon variant="check_circle" size="18" no-margin />
        <strong>Tasks created</strong>
      </div>

      <p class="project-wizard-tasks-success-copy">
        This project now has <strong>{{ generatedSummary.totalTasks }} tasks</strong>.
      </p>
      <p class="project-wizard-tasks-success-copy">
        The size of each task is
        <strong>{{ formatSquareKilometers(generatedSummary.requestedTaskAreaSquareKilometers) }} km2</strong>
      </p>
    </section>
  </section>
</template>

<script setup lang="ts">
import type {
  ProjectWizardTaskGenerationSummary,
  ProjectWizardTasksStepDefinition,
} from '~/types/project-wizard';

interface Props {
  canGenerate: boolean;
  createdProjectName: string;
  generatedSummary: ProjectWizardTaskGenerationSummary | null;
  generating: boolean;
  maximumTaskAreaSquareKilometers: number;
  minimumTaskAreaSquareKilometers: number;
  step: ProjectWizardTasksStepDefinition;
  taskAreaSquareKilometers: number;
  taskAreaStep: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  generate: [];
  reset: [];
  'update:task-area': [value: number];
}>();

const rangeInputId = 'project-wizard-task-area-range';

const formattedMinimumTaskArea = computed(() =>
  formatSquareKilometers(props.minimumTaskAreaSquareKilometers),
);
const formattedMaximumTaskArea = computed(() =>
  formatSquareKilometers(props.maximumTaskAreaSquareKilometers),
);
const formattedTaskArea = computed(() =>
  formatSquareKilometers(props.taskAreaSquareKilometers),
);

function formatSquareKilometers(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function onTaskAreaInput(event: Event) {
  const nextValue = Number((event.target as HTMLInputElement).value);

  emit('update:task-area', nextValue);
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-step-tasks {
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

.project-wizard-tasks-callout,
.project-wizard-tasks-project-created,
.project-wizard-tasks-success {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  padding: 0.95rem 1rem;
  border-radius: 0.4rem;
}

.project-wizard-tasks-project-created {
  color: #0f5132;
  background-color: #eef9f3;
  border: 1px solid #b9e4ca;
  border-left: 4px solid #69b88a;
}

.project-wizard-tasks-project-created-copy {
  display: grid;
  gap: 0.2rem;
}

.project-wizard-tasks-project-created-copy strong,
.project-wizard-tasks-project-created-copy p {
  margin: 0;
}

.project-wizard-tasks-project-created-copy p {
  color: rgba($secondary, 0.98);
  font-size: 0.94rem;
  line-height: 1.55;
}

.project-wizard-tasks-callout {
  color: $text-navy;
  background-color: rgba($purple-background-medium, 0.32);
  border: 1px solid rgba($text-navy, 0.12);
  border-left: 4px solid rgba($text-navy, 0.4);
}

.project-wizard-tasks-callout-copy {
  margin: 0;
  color: rgba($secondary, 0.98);
  font-size: 0.94rem;
  line-height: 1.55;
}

.project-wizard-tasks-range-block {
  display: grid;
  gap: 0.8rem;
}

.project-wizard-tasks-range-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.project-wizard-label {
  font-weight: 600;
}

.project-wizard-tasks-range-value {
  color: $text-navy;
  font-size: 0.95rem;
}

.project-wizard-tasks-range {
  width: 100%;
  accent-color: $tdei-blue;
}

.project-wizard-tasks-range-copy {
  margin: 0;
  color: rgba($secondary, 0.98);
  font-size: 0.96rem;
  line-height: 1.45;
}

.project-wizard-tasks-actions {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.project-wizard-tasks-action {
  min-width: 9.75rem;
  min-height: 2.95rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.project-wizard-tasks-action:hover:not(:disabled),
.project-wizard-tasks-action:focus-visible:not(:disabled) {
  background-color: #0000002b;
  border-color: #dedede;
}

.project-wizard-tasks-action-reset {
  color: $danger-red;
}

.project-wizard-tasks-action-reset:hover:not(:disabled),
.project-wizard-tasks-action-reset:focus-visible:not(:disabled) {
  color: $danger-red;
}

.project-wizard-tasks-success {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.55rem;
  color: #196f55;
  background-color: rgba(73, 174, 122, 0.08);
  border: 1px solid rgba(25, 111, 85, 0.18);
  border-left: 4px solid rgba(25, 111, 85, 0.72);
}

.project-wizard-tasks-success-title {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: $text-navy;
}

.project-wizard-tasks-success-copy {
  margin: 0;
  color: rgba($secondary, 0.98);
  font-size: 0.95rem;
  line-height: 1.5;
}

@include media-breakpoint-down(sm) {
  .project-wizard-tasks-range-header,
  .project-wizard-tasks-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .project-wizard-tasks-action {
    width: 100%;
  }
}
</style>
