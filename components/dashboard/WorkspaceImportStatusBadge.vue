<template>
  <button
    v-if="clickable"
    ref="badgeEl"
    class="workspace-import-status-badge"
    :class="`workspace-import-status-badge-${statusDetails.variant}`"
    type="button"
    aria-label="Setup failed. View details."
    :aria-describedby="tooltipId"
    @pointerenter="showTooltip"
    @pointerleave="hideTooltip"
    @focus="showTooltip"
    @blur="hideTooltip"
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
    ref="badgeEl"
    class="workspace-import-status-badge"
    :class="`workspace-import-status-badge-${statusDetails.variant}`"
    tabindex="0"
    :aria-describedby="tooltipId"
    @pointerenter="showTooltip"
    @pointerleave="hideTooltip"
    @focus="showTooltip"
    @blur="hideTooltip"
  >
    <app-icon
      :variant="statusDetails.icon"
      size="11"
      no-margin
      aria-hidden="true"
    />
    {{ statusDetails.label }}
  </span>

  <Teleport to="body">
    <span
      v-if="tooltipVisible"
      :id="tooltipId"
      class="workspace-import-status-badge-tooltip"
      role="tooltip"
      :style="tooltipStyle"
    >
      {{ statusDetails.title }}
    </span>
  </Teleport>
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
    icon: 'edit_note',
    label: 'Ready',
    title: 'This blank workspace is ready for new edits.',
    variant: 'neutral'
  },
  'failed': {
    icon: 'error_outline',
    label: 'Setup failed. Select to view details',
    title: 'We could not finish setting up this workspace. Select to view details.',
    variant: 'failed'
  },
  'in-progress': {
    icon: 'hourglass_empty',
    label: 'Setting up…',
    title: 'Your workspace is being populated with data from dataset. Keep checking for updates.',
    variant: 'in-progress'
  },
  'completed': {
    icon: 'check_circle_outline',
    label: 'Ready',
    title: 'Your dataset is loaded and the workspace is ready to use.',
    variant: 'completed'
  },
  'empty': {
    icon: 'help_outline',
    label: 'Status unavailable',
    title: 'We cannot confirm whether this workspace is ready. Try refreshing the page.',
    variant: 'unknown'
  }
};

const statusDetails = computed(() => (
  props.status === null
    ? statusDetailsByStatus.NA
    : statusDetailsByStatus[props.status] ?? statusDetailsByStatus.failed
));
const clickable = computed(() => props.interactive && props.status === 'failed');

// Tooltip state
const badgeEl = useTemplateRef<HTMLElement>('badgeEl');
const tooltipVisible = ref(false);
const tooltipPos = ref({ top: 0, left: 0 });
const tooltipId = useId();

function showTooltip(): void {
  if (!badgeEl.value) return;
  const rect = badgeEl.value.getBoundingClientRect();
  tooltipPos.value = {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX + rect.width / 2
  };
  tooltipVisible.value = true;
}

function hideTooltip(): void {
  tooltipVisible.value = false;
}

const tooltipStyle = computed(() => ({
  top: `${tooltipPos.value.top}px`,
  left: `${tooltipPos.value.left}px`
}));
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

<style lang="scss">
@import "~/assets/scss/theme.scss";

.workspace-import-status-badge-tooltip {
  position: absolute;
  z-index: $zindex-tooltip;
  transform: translateX(-50%) translateY(calc(-100% - 0.5rem));
  width: max-content;
  max-width: min(16rem, calc(100vw - 2rem));
  padding: 0.35rem 0.5rem;
  color: $text-tooltip;
  background: $surface-tooltip;
  border-radius: $border-radius;
  box-shadow: $box-shadow-sm;
  font-size: 0.75rem;
  font-weight: $font-weight-normal;
  line-height: 1.4;
  white-space: normal;
  pointer-events: none;

  &::after {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 0.3rem solid transparent;
    border-top-color: $surface-tooltip;
    content: "";
  }
}
</style>
