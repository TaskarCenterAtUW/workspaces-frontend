<template>
  <span :class="badgeClasses">
    <span
      class="project-status-badge-icon"
      aria-hidden="true"
    >
      <img
        :src="iconSrc"
        :alt="''"
      >
    </span>
    {{ statusLabel }}
  </span>
</template>

<script setup lang="ts">
import completedIcon from '~/assets/img/completed.svg';
import draftIcon from '~/assets/img/draft.svg';
import inProgressIcon from '~/assets/img/inprogress.svg';

import type { WorkspaceProjectStatus } from '~/types/projects';

interface Props {
  status: WorkspaceProjectStatus;
}

const props = defineProps<Props>();

const statusLabel = computed(() => {
  switch (props.status) {
    case 'completed':
      return 'Completed';
    case 'in_progress':
      return 'In Progress';
    case 'draft':
    default:
      return 'Draft';
  }
});

const iconSrc = computed(() => {
  switch (props.status) {
    case 'completed':
      return completedIcon;
    case 'in_progress':
      return inProgressIcon;
    case 'draft':
    default:
      return draftIcon;
  }
});

const badgeClasses = computed(() => ({
  'project-status-badge': true,
  'project-status-badge-completed': props.status === 'completed',
  'project-status-badge-in-progress': props.status === 'in_progress',
  'project-status-badge-draft': props.status === 'draft',
}));
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1;
  padding: 0.38rem 0.72rem;
  white-space: nowrap;
}

.project-status-badge-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.95rem;
  height: 0.95rem;
  flex-shrink: 0;
}

.project-status-badge-icon img {
  display: block;
  width: 100%;
  height: 100%;
}

.project-status-badge-completed {
  background-color: #f6fcfa;
  border-color: #d4e4dd;
  color: #5c9f83;
}

.project-status-badge-in-progress {
  background-color: #f4fbff;
  border-color: #c8e0ee;
  color: #5a97cc;
}

.project-status-badge-draft {
  background-color: #fffcf5;
  border-color: #e9e1d3;
  color: #b88d41;
}
</style>
