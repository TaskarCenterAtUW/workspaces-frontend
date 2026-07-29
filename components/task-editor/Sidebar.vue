<template>
  <aside
    :id="sidebarId"
    class="task-editor-sidebar"
    :class="{ 'task-editor-sidebar-open': open }"
    aria-label="Task editor details"
  >
    <button
      class="task-editor-sidebar-handle"
      type="button"
      :aria-controls="sidebarId"
      :aria-expanded="open"
      :aria-label="open ? 'Hide task details panel' : 'Show task details panel'"
      @click="emit('toggle')"
    >
      <app-icon
        :variant="open ? 'chevron_right' : 'chevron_left'"
        size="20"
        no-margin
      />
    </button>

    <div class="task-editor-sidebar-scroll">
      <header class="task-editor-sidebar-hero">
        <button
          class="btn btn-link task-editor-back"
          type="button"
          @click="emit('back')"
        >
          <app-icon
            variant="chevron_left"
            size="20"
            no-margin
          />
          Go back
        </button>

        <h1 class="task-editor-title">
          {{ projectName }}
        </h1>

        <div class="task-editor-task-summary">
          <strong>{{ taskLabel }}</strong>
          <div class="task-editor-task-badges">
            <span class="task-editor-status">{{ taskStatusLabel }}</span>
            <span
              v-if="lockTimeRemaining"
              class="task-editor-lock-time"
            >
              <app-icon
                variant="schedule"
                size="17"
                no-margin
              />
              {{ lockTimeRemaining }}
            </span>
          </div>
        </div>

        <p
          v-if="editorLoadErrorMessage"
          class="task-editor-load-error"
          role="alert"
        >
          {{ editorLoadErrorMessage }}
        </p>
      </header>

      <b-tabs
        class="task-editor-tabs"
        content-class="task-editor-tab-content"
        nav-class="task-editor-tab-list"
        no-fade
        no-nav-style
      >
        <b-tab
          id="task-editor-completion-panel"
          button-id="task-editor-completion-tab"
          class="task-editor-tab-panel"
          title="Completion"
          title-link-class="task-editor-tab"
        >
          <div class="task-editor-info-card">
            <span class="task-editor-info-icon">
              <app-icon
                variant="info"
                size="22"
                no-margin
              />
            </span>
            <div>
              <h2>Task status</h2>
              <p>{{ taskStatusHelpText }}</p>
            </div>
          </div>

          <task-editor-review-panel
            v-if="reviewTask"
            v-model:feedback-notes="feedbackNotes"
            v-model:feedback-reason-category="feedbackReasonCategory"
            v-model:review-decision="reviewDecision"
            :feedback-reason-options="feedbackReasonOptions"
          />
          <task-editor-mapping-panel v-else />
        </b-tab>

        <b-tab
          id="task-editor-instructions-panel"
          button-id="task-editor-instructions-tab"
          class="task-editor-tab-panel task-editor-instructions"
          title="Instructions"
          title-link-class="task-editor-tab"
        >
          <div class="task-editor-section-heading">
            <h2>Instructions</h2>
          </div>
          <workspace-project-details-rich-text-content
            class="task-editor-rich-copy"
            :html="instructions"
          />
        </b-tab>
      </b-tabs>
    </div>

    <footer class="task-editor-sidebar-footer">
      <section class="task-editor-actions">
        <p
          v-if="submitErrorMessage"
          class="task-editor-submit-error"
          aria-live="polite"
        >
          {{ submitErrorMessage }}
        </p>

        <div
          v-if="showActionStatus"
          class="task-editor-action-status"
          :class="{ 'task-editor-action-status-blocked': actionStatusBlocked }"
          aria-live="polite"
        >
          <app-icon
            :variant="actionStatusBlocked ? 'info' : 'check_circle'"
            size="18"
            no-margin
          />
          <span>{{ actionStatusMessage }}</span>
        </div>

        <div class="task-editor-action-list">
          <button
            v-for="action in actions"
            :key="action.id"
            class="btn task-editor-action-button"
            :class="`btn-${action.variant}`"
            type="button"
            :disabled="action.disabled"
            @click="emit('action', action.id)"
          >
            {{ action.label }}
          </button>
        </div>
      </section>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import type {
  TaskFeedbackReasonOption,
  TaskReviewDecision,
} from '~/composables/useTaskEditorContext';
import type { WorkspaceProjectTaskFeedbackReasonCategory } from '~/types/projects';
import type { TaskEditorAction, TaskEditorActionId } from '~/types/task-editor';

interface Props {
  actionStatusBlocked: boolean;
  actionStatusMessage: string;
  actions: TaskEditorAction[];
  editorLoadErrorMessage: string;
  feedbackReasonOptions: TaskFeedbackReasonOption[];
  instructions: string;
  lockTimeRemaining: string;
  open: boolean;
  projectName: string;
  reviewTask: boolean;
  showActionStatus: boolean;
  sidebarId: string;
  submitErrorMessage: string;
  taskLabel: string;
  taskStatusHelpText: string;
  taskStatusLabel: string;
}

defineProps<Props>();
const emit = defineEmits<{
  action: [actionId: TaskEditorActionId];
  back: [];
  toggle: [];
}>();

const feedbackNotes = defineModel<string>('feedbackNotes', { required: true });
const feedbackReasonCategory = defineModel<WorkspaceProjectTaskFeedbackReasonCategory | ''>(
  'feedbackReasonCategory',
  { required: true },
);
const reviewDecision = defineModel<TaskReviewDecision>('reviewDecision', { required: true });
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.task-editor-sidebar {
  min-height: 0;
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: visible;
  width: 100%;
  height: 100%;
  background: $white;
  border: 0;
  border-left: 1px solid rgba($text-navy, 0.1);
  border-radius: 0;
  box-shadow: -0.5rem 0 1.5rem rgba($text-navy, 0.08);
  transition:
    width 0.28s ease,
    box-shadow 0.28s ease;
}

.task-editor-sidebar:not(.task-editor-sidebar-open) {
  box-shadow: -0.2rem 0 1rem rgba($text-navy, 0.04);
}

.task-editor-load-error {
  margin: 0.85rem 0 0;
  padding: 0.75rem;
  color: $danger-red;
  font-size: 0.9rem;
  line-height: 1.45;
  background: rgba($white, 0.92);
  border: 1px solid rgba($danger-red, 0.28);
  border-radius: 0.75rem;
}

.task-editor-sidebar-scroll {
  height: 100%;
  display: grid;
  align-content: start;
  gap: 0;
  padding: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  transition: opacity 0.16s ease;
}

.task-editor-sidebar:not(.task-editor-sidebar-open) .task-editor-sidebar-scroll,
.task-editor-sidebar:not(.task-editor-sidebar-open) .task-editor-sidebar-footer {
  overflow: hidden;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

.task-editor-sidebar-footer {
  position: sticky;
  bottom: 0;
  display: grid;
  gap: 0;
  padding: 1rem 1.75rem 1.25rem;
  background: $white;
  border-top: 1px solid rgba($text-navy, 0.1);
}

.task-editor-sidebar-handle {
  position: absolute;
  top: 2rem;
  left: 0.9rem;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 3.15rem;
  color: $text-navy;
  background: $white;
  border: 1px solid rgba($text-navy, 0.14);
  border-radius: 0.65rem;
  box-shadow: $box-shadow;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    left 0.28s ease,
    transform 0.28s ease;
}

.task-editor-sidebar-handle:hover,
.task-editor-sidebar-handle:focus-visible {
  color: $white;
  background: $primary;
  box-shadow:
    0 0 0 0.38rem rgba($primary, 0.2),
    $box-shadow;
}

.task-editor-sidebar.task-editor-sidebar-open .task-editor-sidebar-handle {
  left: 0;
  transform: translateX(-50%);
}

.task-editor-sidebar:not(.task-editor-sidebar-open) .task-editor-sidebar-handle {
  left: 50%;
  transform: translateX(-50%);
}

.task-editor-sidebar-hero {
  display: grid;
  gap: 1.25rem;
  padding: 1.75rem;
  background: $purple-background-light;
}

.task-editor-title {
  margin: 0;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 1.65rem;
  font-weight: 700;
  line-height: 1.3;
}

.task-editor-task-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1rem;
  color: $secondary;
  border-top: 1px dashed rgba($text-navy, 0.25);
}

.task-editor-task-badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.task-editor-status {
  width: fit-content;
  margin: 0;
  padding: 0.35rem 0.6rem;
  color: $primary;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  background: rgba($primary, 0.08);
  border-radius: 999px;
}

.task-editor-lock-time {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  color: $status-warning-text;
  font-size: 0.82rem;
  font-weight: 600;
  background: $status-warning-surface;
  border: 1px solid $status-warning-border;
  border-radius: 999px;
}

.task-editor-tabs {
  background: $white;
}

.task-editor-tabs :deep(.task-editor-tab-list) {
  display: flex;
  gap: 1.75rem;
  margin: 0;
  padding: 1.25rem 1.75rem 0;
  list-style: none;
  background: $white;
  border-bottom: 0.25rem solid rgba($primary, 0.08);
}

.task-editor-tabs :deep(.task-editor-tab) {
  position: relative;
  padding: 0 0 0.75rem;
  color: $secondary;
  font-size: 1rem;
  font-weight: 600;
  background: transparent;
  border: 0;
  border-radius: 0;
}

.task-editor-tabs :deep(.task-editor-tab::after) {
  position: absolute;
  right: 0;
  bottom: -0.25rem;
  left: 0;
  height: 0.25rem;
  content: "";
  background: transparent;
}

.task-editor-tabs :deep(.task-editor-tab:hover),
.task-editor-tabs :deep(.task-editor-tab:focus-visible),
.task-editor-tabs :deep(.task-editor-tab.active) {
  color: $text-navy;
}

.task-editor-tabs :deep(.task-editor-tab.active::after) {
  background: $text-navy;
}

.task-editor-tabs :deep(.task-editor-tab-panel) {
  display: grid;
  align-content: start;
  gap: 1.75rem;
  padding: 1.5rem 1.75rem 2rem;
}

.task-editor-tabs :deep(.task-editor-tab-panel:not(.active)) {
  display: none;
}

.task-editor-info-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.85rem;
  padding: 1rem;
  background: $surface-subtle;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 0.8rem;
}

.task-editor-info-card h2,
.task-editor-info-card p {
  margin: 0;
}

.task-editor-info-card h2 {
  color: $text-navy;
  font-size: 1rem;
  font-weight: 700;
}

.task-editor-info-card p {
  margin-top: 0.25rem;
  color: $secondary;
  font-size: 0.93rem;
  line-height: 1.45;
}

.task-editor-info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  color: $secondary;
  background: $purple-background-light;
  border-radius: 50%;
}

.task-editor-section-heading {
  display: grid;
  gap: 0.3rem;
}

.task-editor-section-heading h2 {
  margin: 0;
  color: $text-navy;
  font-size: 1.25rem;
  font-weight: 700;
}

.task-editor-instructions {
  display: grid;
  gap: 0.85rem;
}

.task-editor-rich-copy {
  color: $secondary;
  font-size: 1rem;
  line-height: 1.55;
}

.task-editor-actions {
  display: grid;
  gap: 0.9rem;
  position: relative;
  z-index: 1;
}

.task-editor-submit-error {
  margin: 0;
  color: $danger-red;
  font-size: 0.9rem;
  line-height: 1.45;
}

.task-editor-action-status {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.6rem;
  margin: 0;
  padding: 0.85rem 0.9rem;
  color: $tdei-green;
  font-size: 0.92rem;
  line-height: 1.45;
  background: rgba($white, 0.92);
  border: 1px solid rgba($tdei-green, 0.24);
  border-radius: 0.85rem;
}

.task-editor-action-status :deep(.material-icons) {
  margin-top: 0;
}

.task-editor-action-status-blocked {
  color: $text-navy;
  background: $purple-background-medium;
  border-color: rgba($primary, 0.18);
}

.task-editor-action-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.task-editor-action-button {
  width: 100%;
  min-height: 3.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: 1rem;
  font-weight: 700;
  border-radius: 0.35rem;
}

.task-editor-action-button.btn-primary {
  color: $white;
  background: $primary;
  border-color: $primary;
}

.task-editor-action-button.btn-outline-secondary {
  color: $secondary;
  background: $white;
  border-color: rgba($text-navy, 0.16);
}

.task-editor-back {
  width: fit-content;
  min-height: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0;
  color: $secondary;
  font-weight: 700;
  text-decoration: none;
  background: transparent;
  border: 0;
}

.task-editor-back:hover,
.task-editor-back:focus-visible {
  color: $primary;
}

@include media-breakpoint-down(sm) {
  .task-editor-title {
    font-size: 1.45rem;
  }

  .task-editor-sidebar-hero,
  .task-editor-sidebar-footer {
    padding-inline: 1rem;
  }

  .task-editor-tabs :deep(.task-editor-tab-list),
  .task-editor-tabs :deep(.task-editor-tab-panel) {
    padding-inline: 1rem;
  }

  .task-editor-task-summary {
    align-items: flex-start;
    flex-direction: column;
  }

  .task-editor-task-badges {
    justify-content: flex-start;
  }

  .task-editor-action-list {
    grid-template-columns: 1fr;
  }
}
</style>
