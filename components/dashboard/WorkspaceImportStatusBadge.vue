<template>
  <button
    v-if="clickable"
    class="workspace-import-status-badge"
    :class="`workspace-import-status-badge-${statusDetails.variant}`"
    type="button"
    :title="statusDetails.title"
    aria-label="View import failure details"
    @click="emit('click')"
  >
    <app-icon
      :variant="statusDetails.icon"
      size="11"
      no-margin
      aria-hidden="true"
    />
    {{ statusDetails.label }}
  </button>
  <span
    v-else
    class="workspace-import-status-badge"
    :class="`workspace-import-status-badge-${statusDetails.variant}`"
    :title="statusDetails.title"
  >
    <app-icon
      :variant="statusDetails.icon"
      size="11"
      no-margin
      aria-hidden="true"
    />
    {{ statusDetails.label }}
  </span>
</template>

<script setup lang="ts">
import type { WorkspaceImportStatus } from '~/types/workspaces';

interface Props {
  interactive?: boolean;
  status: WorkspaceImportStatus | null;
}

interface StatusDetails {
  icon: string;
  label: string;
  title: string;
  variant: 'neutral' | 'failed' | 'in-progress' | 'completed' | 'unknown';
}

const props = defineProps<Props>();
const emit = defineEmits<{
  click: [];
}>();

const statusDetailsByStatus: Record<WorkspaceImportStatus, StatusDetails> = {
  'NA': {
    icon: 'remove_circle_outline',
    label: 'Not applicable',
    title: 'Import not applicable',
    variant: 'neutral'
  },
  'failed': {
    icon: 'error_outline',
    label: 'Failed',
    title: 'Import failed',
    variant: 'failed'
  },
  'in-progress': {
    icon: 'hourglass_empty',
    label: 'In progress',
    title: 'Import in progress',
    variant: 'in-progress'
  },
  'completed': {
    icon: 'check_circle_outline',
    label: 'Completed',
    title: 'Import completed',
    variant: 'completed'
  },
  'empty': {
    icon: 'help_outline',
    label: 'Unknown',
    title: 'Import status unknown',
    variant: 'unknown'
  }
};

const statusDetails = computed(() => (
  props.status === null
    ? statusDetailsByStatus.empty
    : statusDetailsByStatus[props.status] ?? statusDetailsByStatus.empty
));
const clickable = computed(() => props.interactive && props.status === 'failed');
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.workspace-import-status-badge {
  appearance: none;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.25rem;
  width: fit-content;
  padding: 0.16rem 0.45rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-family: var(--primary-font-family);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

button.workspace-import-status-badge {
  cursor: pointer;
}

button.workspace-import-status-badge:hover,
button.workspace-import-status-badge:focus-visible {
  box-shadow: 0 0 0 0.2rem rgba($danger-red, 0.15);
}

.workspace-import-status-badge :deep(.material-icons) {
  font-size: 14px;
  line-height: 1;
}

.workspace-import-status-badge-completed {
  color: $status-completed-text;
  background-color: $status-completed-surface;
  border-color: $status-completed-border;
}

.workspace-import-status-badge-in-progress {
  color: $status-in-progress-text;
  background-color: $status-in-progress-surface;
  border-color: $status-in-progress-border;
}

.workspace-import-status-badge-failed {
  color: $danger-red;
  background-color: rgba($danger-red, 0.06);
  border-color: rgba($danger-red, 0.3);
}

.workspace-import-status-badge-neutral,
.workspace-import-status-badge-unknown {
  color: $text-secondary;
  background-color: $surface-badge-muted;
  border-color: $border-badge-muted;
}

.workspace-import-status-badge-unknown {
  color: $status-warning-text;
  background-color: $status-warning-surface;
  border-color: $status-warning-border;
}
</style>
