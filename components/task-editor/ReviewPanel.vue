<template>
  <section class="task-editor-review-panel">
    <fieldset class="task-editor-feedback-group">
      <legend class="task-editor-feedback-legend">Review this mapping</legend>
      <label
        class="task-editor-feedback-option"
        :class="{ 'task-editor-feedback-option-selected': reviewDecision === 'approve' }"
      >
        <input
          v-model="reviewDecision"
          class="visually-hidden"
          type="radio"
          name="task-editor-review-decision"
          value="approve"
        >
        <span>Approve</span>
      </label>
      <label
        class="task-editor-feedback-option"
        :class="{ 'task-editor-feedback-option-selected': reviewDecision === 'remap' }"
      >
        <input
          v-model="reviewDecision"
          class="visually-hidden"
          type="radio"
          name="task-editor-review-decision"
          value="remap"
        >
        <span>Request remap</span>
      </label>
    </fieldset>

    <div
      v-if="reviewDecision === 'remap'"
      class="task-editor-feedback-fields"
    >
      <label
        class="task-editor-field-label"
        for="task-editor-feedback-reason"
      >
        Reason
      </label>
      <app-select
        id="task-editor-feedback-reason"
        v-model="feedbackReasonCategory"
        class="task-editor-feedback-select"
        :options="feedbackReasonOptions"
        placeholder="Select a reason"
        aria-label="Select a remap reason"
      />

      <label
        class="task-editor-field-label"
        for="task-editor-feedback-notes"
      >
        Notes
      </label>
      <textarea
        id="task-editor-feedback-notes"
        v-model="feedbackNotes"
        class="form-control task-editor-field task-editor-feedback-notes"
        rows="5"
        placeholder="Describe what the mapper needs to fix"
        required
      />
      <p class="task-editor-feedback-hint">
        A reason and notes are required to request a remap.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  TaskFeedbackReasonOption,
  TaskReviewDecision,
} from '~/composables/useTaskEditorContext';
import type { WorkspaceProjectTaskFeedbackReasonCategory } from '~/types/projects';

interface Props {
  feedbackReasonOptions: TaskFeedbackReasonOption[];
}

defineProps<Props>();

const feedbackNotes = defineModel<string>('feedbackNotes', { required: true });
const feedbackReasonCategory = defineModel<WorkspaceProjectTaskFeedbackReasonCategory | ''>(
  'feedbackReasonCategory',
  { required: true },
);
const reviewDecision = defineModel<TaskReviewDecision>('reviewDecision', { required: true });
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.task-editor-review-panel {
  display: grid;
  gap: 0.9rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba($text-navy, 0.1);
}

.task-editor-feedback-fields,
.task-editor-feedback-group {
  display: grid;
  gap: 0.75rem;
}

.task-editor-field-label,
.task-editor-feedback-legend {
  margin: 0;
  color: $text-navy;
  font-size: 0.85rem;
  font-weight: 700;
}

.task-editor-feedback-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 0;
  margin: 0;
  border: 0;
}

.task-editor-feedback-legend {
  flex: 0 0 100%;
  margin-bottom: 0.25rem;
  font-size: 1.2rem;
}

.task-editor-field {
  color: $text-navy;
  background: $white;
  border-color: rgba($text-navy, 0.14);
  border-radius: 0.85rem;
}

.task-editor-field:focus {
  border-color: rgba($primary, 0.4);
  box-shadow: 0 0 0 0.2rem rgba($primary, 0.12);
}

.task-editor-feedback-notes {
  min-height: 7rem;
  resize: vertical;
}

.task-editor-feedback-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.55rem 1.25rem;
  color: $text-navy;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
  background: $white;
  border: 1px solid $text-navy;
  border-radius: 999px;
  cursor: pointer;
}

.task-editor-feedback-option:hover {
  background: rgba($text-navy, 0.05);
}

.task-editor-feedback-option:focus-within {
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba($text-navy, 0.18);
}

.task-editor-feedback-option-selected {
  color: $white;
  background: $text-navy;
  border-color: $text-navy;
}

.task-editor-feedback-option-selected:hover,
.task-editor-feedback-option-selected:focus-within {
  color: $white;
  background: $text-navy;
  border-color: $text-navy;
}

.task-editor-feedback-option > span {
  white-space: nowrap;
}

.task-editor-feedback-select {
  width: 100%;
}

.task-editor-feedback-hint {
  margin: 0;
  color: $secondary;
  font-size: 0.9rem;
  line-height: 1.45;
}

@include media-breakpoint-down(sm) {
  .task-editor-feedback-group {
    align-items: stretch;
    flex-direction: column;
  }

  .task-editor-feedback-legend {
    flex-basis: auto;
  }
}
</style>
