<template>
  <section class="project-detail-task-action-bar" aria-label="Selected task actions">
    <button
      class="btn btn-link project-detail-task-action-close"
      type="button"
      @click="$emit('close')"
    >
      <app-icon variant="close" size="20" no-margin />
      Close
    </button>

    <div class="project-detail-task-action-summary">
      <div class="project-detail-task-action-copy">
        <span>Selected Task</span>
        <strong>{{ task.label }}</strong>
      </div>

      <div class="project-detail-task-action-status">
        <span>Current Status</span>
        <strong>
          <span
            class="project-detail-task-action-status-swatch"
            :class="`project-detail-task-action-status-${task.status}`"
          />
          {{ statusLabel }}
        </strong>
      </div>
    </div>

    <button
      v-if="showActionButton"
      class="btn project-detail-task-action-primary"
      type="button"
      :disabled="actionDisabled"
      @click="$emit('action')"
    >
      <app-spinner v-if="busy" size="sm" />
      <template v-else>
        {{ actionLabel }}
      </template>
    </button>
  </section>
</template>

<script setup lang="ts">
import type { WorkspaceProjectTaskListItem } from '~/types/projects';

interface Props {
  actionDisabled: boolean;
  actionLabel: string;
  busy: boolean;
  showActionButton: boolean;
  statusLabel: string;
  task: WorkspaceProjectTaskListItem;
}

defineProps<Props>();

defineEmits<{
  action: [];
  close: [];
}>();
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-detail-task-action-bar {
  min-height: 6.6rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1rem 2.2rem;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba($text-navy, 0.12);
  border-top: 0;
  border-radius: 0 0 1rem 1rem;
  box-shadow: 0 -0.6rem 1.8rem rgba($text-navy, 0.08);
  backdrop-filter: blur(8px);
}

.project-detail-task-action-close {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0;
  color: #db4b4b;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
}

.project-detail-task-action-close:hover,
.project-detail-task-action-close:focus-visible {
  color: #c93c3c;
}

.project-detail-task-action-summary {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2rem;
}

.project-detail-task-action-copy,
.project-detail-task-action-status {
  display: grid;
  gap: 0.28rem;
  min-width: 0;
}

.project-detail-task-action-copy span,
.project-detail-task-action-status span {
  color: #707796;
  font-size: 0.95rem;
}

.project-detail-task-action-copy strong,
.project-detail-task-action-status strong {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: #1a1e3d;
  font-size: 1.1rem;
  font-weight: 700;
}

.project-detail-task-action-status {
  padding-left: 1.8rem;
  border-left: 1px solid rgba($text-navy, 0.12);
}

.project-detail-task-action-status-swatch {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  border: 1px solid rgba(90, 96, 123, 0.12);
}

.project-detail-task-action-status-ready_for_mapping {
  background: #fde9aa;
}

.project-detail-task-action-status-ready_for_validation {
  background: #a8d8f8;
}

.project-detail-task-action-status-needs_more_mapping {
  background: #f8be90;
}

.project-detail-task-action-status-completed {
  background: #aae8cd;
}

.project-detail-task-action-primary {
  min-width: 11.5rem;
  min-height: 3.35rem;
  padding-inline: 1.5rem;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 700;
  background: #4d158d;
  border: 1px solid #4d158d;
  border-radius: 0.55rem;
}

.project-detail-task-action-primary:hover:not(:disabled),
.project-detail-task-action-primary:focus-visible:not(:disabled) {
  color: #ffffff;
  background: #421178;
  border-color: #421178;
}

.project-detail-task-action-primary:disabled {
  opacity: 0.62;
}

@include media-breakpoint-down(xl) {
  .project-detail-task-action-bar {
    padding-left: 1.75rem;
    padding-right: 1.75rem;
  }
}

@include media-breakpoint-down(lg) {
  .project-detail-task-action-bar {
    flex-wrap: wrap;
    padding: 1rem 1.75rem;
  }

  .project-detail-task-action-summary {
    justify-content: flex-start;
  }
}

@include media-breakpoint-down(md) {
  .project-detail-task-action-summary {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .project-detail-task-action-status {
    padding-left: 0;
    border-left: 0;
  }
}

@include media-breakpoint-down(sm) {
  .project-detail-task-action-bar {
    padding: 1rem;
  }

  .project-detail-task-action-primary {
    width: 100%;
  }
}
</style>
