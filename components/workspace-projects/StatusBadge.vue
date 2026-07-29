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
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 6px 10px;
  white-space: nowrap;
  width: fit-content;
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
  background-color: #F6FCFA;
  border-color: #D4E4DD;
  color: #067A57;
}

.project-status-badge-in-progress {
  background-color: #F4FBFF;
  border-color: #C8E0EE;
  color: #1A74A8;
}

.project-status-badge-draft {
  background-color: #FFFCF5;
  border-color: #e9e1d3;
  color: #8F6C1A;
}
</style>
