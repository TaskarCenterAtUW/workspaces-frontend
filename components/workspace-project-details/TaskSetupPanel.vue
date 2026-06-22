<template>
  <section class="project-task-setup-card">
    <header class="project-task-setup-hero">
      <h2>Tasks generation</h2>
      <p>Define task area to generate tasks.</p>
    </header>

    <section
      v-if="hasAoi"
      class="project-task-setup-callout project-task-setup-callout-info"
    >
      <app-icon variant="info" size="18" no-margin />
      <div>
        <p>Set the task area between <strong>{{ formattedMinimumTaskArea }} km2</strong> to <strong>{{ formattedMaximumTaskArea }} km2</strong> and click generate tasks.</p>
      </div>
    </section>

    <section
      v-if="!hasAoi"
      class="project-task-setup-callout project-task-setup-callout-warning"
    >
      <app-icon variant="error" size="18" no-margin />
      <div>
        <strong>Area of interest unavailable</strong>
        <p>Tasks cannot be generated for this project until the project boundary is available.</p>
      </div>
    </section>

    <div class="project-task-setup-range-block">
      <div class="project-task-setup-range-header">
        <label class="project-task-setup-label" :for="rangeInputId">Set task area</label>
        <strong>{{ formattedTaskArea }} km2</strong>
      </div>

      <input
        :id="rangeInputId"
        class="project-task-setup-range"
        :style="{ '--task-range-progress': `${rangeProgressPercent}%` }"
        type="range"
        :min="minimumTaskAreaSquareKilometers"
        :max="maximumTaskAreaSquareKilometers"
        :step="taskAreaStep"
        :value="taskAreaSquareKilometers"
        :disabled="saving"
        @input="onTaskAreaInput"
      >

      <p class="project-task-setup-range-copy">
        Each task will be generated for <strong>{{ formattedTaskArea }} km2</strong>
      </p>
    </div>

    <div class="project-task-setup-actions">
      <button
        class="btn project-task-setup-action project-task-setup-action-generate"
        type="button"
        :disabled="!canGenerate"
        @click="emit('generate')"
      >
        <app-spinner v-if="generating" size="sm" />
        <template v-else>
          <app-icon variant="grid_view" size="18" no-margin />
          {{ generatedSummary ? 'Generate Again' : 'Generate Tasks' }}
        </template>
      </button>

      <button
        class="btn project-task-setup-action project-task-setup-action-reset"
        type="button"
        :disabled="generating || saving"
        @click="emit('reset')"
      >
        <app-icon variant="refresh" size="18" no-margin />
        Reset
      </button>
    </div>

    <section
      v-if="generatedSummary && !savedSummary"
      class="project-task-setup-callout project-task-setup-callout-success"
    >
      <app-icon variant="check_circle" size="18" no-margin />
      <div>
        <strong>Tasks created</strong>
        <p>This project will be created with <strong>{{ generatedSummary.totalTasks }} tasks</strong>.</p>
        <p>The size of each task is approximately <strong>{{ formattedTaskArea }} km2</strong></p>
      </div>
    </section>

    <section
      v-if="generatedSummary && !savedSummary"
      class="project-task-setup-save-panel"
    >
      <div class="project-task-setup-save-copy">
        <span class="project-task-setup-save-kicker">Step 02</span>
        <strong>Save generated tasks</strong>
        <p>Review the grid on the map, then save the trimmed task set to add it to this project.</p>
      </div>

      <button
        class="btn project-task-setup-action project-task-setup-action-save"
        type="button"
        :disabled="!canSave"
        @click="emit('save')"
      >
        <app-spinner v-if="saving" size="sm" />
        <template v-else>
          <app-icon variant="save_alt" size="18" no-margin />
          Save Tasks
        </template>
      </button>
    </section>

    <section
      v-if="savedSummary"
      class="project-task-setup-callout project-task-setup-callout-success"
    >
      <app-icon variant="check_circle" size="18" no-margin />
      <div>
        <strong>Tasks saved</strong>
        <p>This project now has <strong>{{ savedSummary.taskCount }} tasks</strong>.</p>
        <p>The saved task boundaries are available on the project map and task list.</p>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
/**
 * TaskSetupPanel.vue
 *
 * Two-step panel that guides the user through generating and saving tasks for a project:
 *
 *   Step 1 — Generate: User drags the range slider to set the task area (in km²),
 *             then clicks "Generate Tasks" to create a task grid preview on the map.
 *             The grid is a preview only — it hasn't been saved to the API yet.
 *
 *   Step 2 — Save: Once happy with the grid preview, the user clicks "Save Tasks"
 *             to commit the grid to the API and make tasks permanent.
 *
 * This component is purely presentational — all data fetching and state lives in
 * `useProjectTasking` composable. This component just fires events and shows state.
 *
 * Events emitted:
 *   - `generate`            → trigger task grid generation
 *   - `reset`               → clear the generated grid and go back to defaults
 *   - `save`                → commit the generated grid to the API
 *   - `update:task-area`    → user changed the range slider value
 */
import type {
  ProjectWizardTaskGenerationSummary,
  ProjectWizardTaskSaveSummary,
} from '~/types/project-wizard';

interface Props {
  /** Whether the Generate button should be enabled (AOI exists, no in-flight request, etc.). */
  canGenerate: boolean;
  /** Whether the Save button should be enabled (grid generated but not yet saved). */
  canSave: boolean;
  /** Set by the composable once the server has returned a generated task grid. Null before generation. */
  generatedSummary: ProjectWizardTaskGenerationSummary | null;
  /** True while the generate API request is in-flight. Disables the button and shows a spinner. */
  generating: boolean;
  /** Whether the project has an AOI polygon. If false, a warning callout is shown. */
  hasAoi: boolean;
  /** Upper bound of the slider range (km²). */
  maximumTaskAreaSquareKilometers: number;
  /** Lower bound of the slider range (km²). */
  minimumTaskAreaSquareKilometers: number;
  /** The estimated number of tasks that would be created at the current area setting. */
  previewTaskCount: number;
  projectName: string;
  /** Set by the composable once tasks have been saved to the API. Null before saving. */
  savedSummary: ProjectWizardTaskSaveSummary | null;
  /** True while the save API request is in-flight. */
  saving: boolean;
  /** Current slider value (km² per task). Controlled by the parent via `update:task-area`. */
  taskAreaSquareKilometers: number;
  /** Step increment for the range slider. */
  taskAreaStep: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  generate: [];
  reset: [];
  save: [];
  'update:task-area': [value: number];
}>();

/**
 * Stable ID for the range input. Declared as a const here so the `<label for="">` and
 * `<input id="">` always match, making the label programmatically associated with the input.
 * If you ever render multiple instances of this component on the same page,
 * replace this with `useId()` (available in Vue 3.5+) to generate a unique ID per instance.
 */
const rangeInputId = 'project-task-setup-range';

/** Formatted strings for the min/max labels and current value display. */
const formattedMinimumTaskArea = computed(() =>
  formatSquareKilometers(props.minimumTaskAreaSquareKilometers),
);
const formattedMaximumTaskArea = computed(() =>
  formatSquareKilometers(props.maximumTaskAreaSquareKilometers),
);
const formattedTaskArea = computed(() =>
  formatSquareKilometers(props.taskAreaSquareKilometers),
);

/**
 * Percentage (0–100) of how far the slider thumb is from the left edge.
 * This drives the CSS custom property `--task-range-progress` which is used
 * to colour the "filled" portion of the range track in the stylesheet.
 * (Native `<input type="range">` doesn't support styling the filled portion without JS.)
 */
const rangeProgressPercent = computed(() => {
  const spread = props.maximumTaskAreaSquareKilometers - props.minimumTaskAreaSquareKilometers;

  if (spread <= 0) {
    return 0;
  }

  return ((props.taskAreaSquareKilometers - props.minimumTaskAreaSquareKilometers) / spread) * 100;
});

/** Format a raw km² number for display (e.g. 1.5 → "1.5", 1000 → "1,000"). */
function formatSquareKilometers(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * The range input uses a controlled pattern (`:value` binding + `@input` handler) rather
 * than `v-model` because the parent needs to normalise the value before accepting it.
 * We cast to Number here since `event.target.value` is always a string.
 */
function onTaskAreaInput(event: Event) {
  emit('update:task-area', Number((event.target as HTMLInputElement).value));
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-task-setup-card {
  display: grid;
  gap: 1.55rem;
  padding: 1.55rem 1.65rem 1.7rem;
  background: #ffffff;
  border: 1px solid rgba(172, 184, 215, 0.28);
  border-radius: 1rem;
  box-shadow: 0 1rem 2.2rem rgba($text-navy, 0.04);
}

.project-task-setup-hero {
  display: grid;
  gap: 0.35rem;
}

.project-task-setup-hero h2 {
  margin: 0;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 1.95rem;
  font-weight: 700;
  line-height: 1.04;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}

.project-task-setup-hero p {
  margin: 0;
  color: #667091;
  font-size: 1.05rem;
  line-height: 1.45;
}

.project-task-setup-callout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  padding: 1rem 1.05rem;
  border: 1px solid rgba(204, 214, 239, 0.8);
  border-left-width: 0.35rem;
  border-radius: 0.75rem;
}

.project-task-setup-callout strong,
.project-task-setup-callout p {
  margin: 0;
}

.project-task-setup-callout p {
  color: #2f3657;
  font-size: 0.98rem;
  line-height: 1.45;
}

.project-task-setup-callout-info {
  color: #707aa0;
  background: #f9faff;
  border-color: rgba(204, 214, 239, 0.92);
  border-left-color: #8f98b7;
}

.project-task-setup-callout-info :deep(.material-symbols-outlined) {
  color: #7d88aa;
}

.project-task-setup-callout-success {
  color: #195747;
  background: #f3fcf8;
  border-color: rgba(188, 235, 221, 0.95);
  border-left-color: #28a07a;
}

.project-task-setup-callout-success :deep(.material-symbols-outlined) {
  color: #28a07a;
}

.project-task-setup-callout-warning {
  color: #8a3d18;
  background: #fff5f1;
  border-color: rgba(234, 195, 179, 0.95);
  border-left-color: #cf683a;
}

.project-task-setup-range-block {
  display: grid;
  gap: 0.95rem;
}

.project-task-setup-range-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.project-task-setup-label {
  color: $text-navy;
  font-size: 1.05rem;
  font-weight: 500;
}

.project-task-setup-range-header strong {
  color: #56648d;
  font-size: 1rem;
  font-weight: 700;
}

.project-task-setup-range {
  width: 100%;
  height: 0.7rem;
  appearance: none;
  background: transparent;
}

.project-task-setup-range::-webkit-slider-runnable-track {
  height: 0.45rem;
  background: linear-gradient(
    90deg,
    #4d5fda 0%,
    #4d5fda var(--task-range-progress),
    #e6eaf5 var(--task-range-progress),
    #e6eaf5 100%
  );
  border-radius: 999px;
}

.project-task-setup-range::-webkit-slider-thumb {
  width: 1.7rem;
  height: 1.7rem;
  margin-top: -0.62rem;
  appearance: none;
  background: #ffffff;
  border: 1px solid #909ac0;
  border-radius: 999px;
  box-shadow: 0 0.2rem 0.45rem rgba(26, 30, 61, 0.1);
}

.project-task-setup-range::-moz-range-track {
  height: 0.45rem;
  background: #e6eaf5;
  border: 0;
  border-radius: 999px;
}

.project-task-setup-range::-moz-range-progress {
  height: 0.45rem;
  background: #4d5fda;
  border-radius: 999px;
}

.project-task-setup-range::-moz-range-thumb {
  width: 1.7rem;
  height: 1.7rem;
  background: #ffffff;
  border: 1px solid #909ac0;
  border-radius: 999px;
  box-shadow: 0 0.2rem 0.45rem rgba(26, 30, 61, 0.1);
}

.project-task-setup-range-copy {
  margin: 0;
  color: #667091;
  font-size: 0.98rem;
  line-height: 1.45;
}

.project-task-setup-range-copy strong {
  color: #4e5674;
}

.project-task-setup-actions {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.project-task-setup-action {
  min-width: 13rem;
  min-height: 3.45rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  font-size: 1rem;
  font-weight: 500;
  border-radius: 0.6rem;
}

.project-task-setup-action-generate {
  color: $text-navy;
  background: #ffffff;
  border: 1px solid #cfd6eb;
}

.project-task-setup-action-generate:hover:not(:disabled),
.project-task-setup-action-generate:focus-visible:not(:disabled) {
  color: $text-navy;
  background: #f8faff;
  border-color: #b9c3e1;
}

.project-task-setup-action-reset {
  color: #e34d4d;
  background: #ffffff;
  border: 1px solid #cfd6eb;
}

.project-task-setup-action-reset:hover:not(:disabled),
.project-task-setup-action-reset:focus-visible:not(:disabled) {
  color: #d93b3b;
  background: #fff8f8;
  border-color: #ebb9b9;
}

.project-task-setup-save-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.05rem;
  background: #fbfbfe;
  border: 1px solid rgba(207, 214, 235, 0.9);
  border-radius: 0.8rem;
}

.project-task-setup-save-copy {
  display: grid;
  gap: 0.25rem;
}

.project-task-setup-save-kicker {
  color: #7b86a8;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.project-task-setup-save-copy strong {
  color: $text-navy;
  font-size: 1rem;
}

.project-task-setup-save-copy p {
  margin: 0;
  color: #667091;
  line-height: 1.45;
}

.project-task-setup-action-save {
  min-width: 11.5rem;
  color: #ffffff;
  background: #5f2ca5;
  border: 1px solid #5f2ca5;
}

.project-task-setup-action-save:hover:not(:disabled),
.project-task-setup-action-save:focus-visible:not(:disabled) {
  color: #ffffff;
  background: #542493;
  border-color: #542493;
}

@include media-breakpoint-down(lg) {
  .project-task-setup-hero,
  .project-task-setup-actions,
  .project-task-setup-save-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .project-task-setup-action {
    width: 100%;
  }
}

@include media-breakpoint-down(sm) {
  .project-task-setup-card {
    padding: 1.15rem;
  }

  .project-task-setup-range-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
