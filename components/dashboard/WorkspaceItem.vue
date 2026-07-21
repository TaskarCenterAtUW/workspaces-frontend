<template>
  <button
    class="workspace-card"
    :class="{ 'workspace-card-selected': selected }"
    type="button"
    :aria-label="`Select workspace ${workspace.title}, ID ${workspace.id}`"
    :aria-pressed="selected"
  >
    <span class="workspace-card-heading">
      <span
        class="workspace-card-icon"
        aria-hidden="true"
      >
        <img
          :src="workspaceIcon"
          alt=""
        >
      </span>

      <span class="workspace-card-copy">
        <strong :title="workspace.title">{{ workspace.title }}</strong>
        <span>Created {{ createdTime }}</span>
      </span>

      <img
        v-if="selected"
        class="workspace-card-selected-icon"
        :src="selectedIcon"
        alt=""
      >
    </span>

    <span class="workspace-card-meta">
      <span>
        <img
          :src="dataTypeIcon"
          alt=""
        >
        {{ typeLabel }}
      </span>
      <span>
        <img
          :src="listProjectsIcon"
          alt=""
        >
        {{ projectLabel }}
      </span>
      <app-icon
        class="workspace-card-chevron"
        variant="chevron_right"
        size="22"
        no-margin
      />
    </span>
  </button>
</template>

<script setup lang="ts">
import dataTypeIcon from '~/assets/img/data-type.svg';
import listProjectsIcon from '~/assets/img/list-projects.svg';
import workspaceIcon from '~/assets/img/project.svg';
import selectedIcon from '~/assets/img/check-circle.svg';
import { formatElapsed } from '~/util/time';

import type { Workspace } from '~/types/workspaces';

interface Props {
  projectCount?: number | null;
  selected?: boolean;
  workspace: Workspace;
}

const props = withDefaults(defineProps<Props>(), {
  projectCount: null,
  selected: false,
});

const createdTime = computed(() => formatElapsed(props.workspace.createdAt));
const typeLabel = computed(() => props.workspace.type.toUpperCase());
const projectLabel = computed(() => {
  if (props.projectCount === null) {
    return 'Projects';
  }

  return `${props.projectCount} ${props.projectCount === 1 ? 'Project' : 'Projects'}`;
});
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

$workspace-card-padding: 1rem;
$workspace-card-gap: 0.85rem;
$workspace-card-icon-size: 2.6rem;
$workspace-card-radius: 0.7rem;
$workspace-card-title-size: 0.98rem;
$workspace-card-copy-size: 0.86rem;
$workspace-card-meta-size: 0.88rem;
$workspace-card-selected-icon-size: 1.25rem;
$workspace-card-meta-icon-height: 1rem;

.workspace-card {
  width: 100%;
  display: grid;
  gap: $workspace-card-gap;
  padding: $workspace-card-padding;
  color: $text-navy;
  text-align: left;
  background: $white;
  border: $border-width solid $border-color;
  border-radius: $workspace-card-radius;
  box-shadow: $box-shadow-sm;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.workspace-card:hover,
.workspace-card:focus-visible {
  border-color: rgba($primary, 0.35);
  box-shadow: 0 0.5rem 1.25rem rgba($primary, 0.1);
}

.workspace-card-selected {
  position: sticky;
  top: 0;
  z-index: 1;
  background: $purple-background-subtle;
  border-color: rgba($primary, 0.24);
}

.workspace-card-heading {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: $workspace-card-gap;
}

.workspace-card-icon {
  width: $workspace-card-icon-size;
  height: $workspace-card-icon-size;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: $workspace-card-radius;
}

.workspace-card-icon img {
  width: 100%;
  height: 100%;
}

.workspace-card-copy {
  min-width: 0;
  display: grid;
  gap: 0.15rem;
}

.workspace-card-copy strong {
  overflow: hidden;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: $workspace-card-title-size;
  font-weight: $font-weight-semibold;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-card-copy span,
.workspace-card-meta {
  color: $secondary;
  font-size: $workspace-card-copy-size;
}

.workspace-card-selected-icon {
  width: $workspace-card-selected-icon-size;
  height: $workspace-card-selected-icon-size;
}

.workspace-card-meta {
  display: flex;
  align-items: center;
  gap: $spacer;
  padding-top: 0.75rem;
  font-size: $workspace-card-meta-size;
  border-top: $border-width dashed rgba($secondary, 0.2);
}

.workspace-card-meta > span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.workspace-card-meta img {
  width: auto;
  height: $workspace-card-meta-icon-height;
}

.workspace-card-chevron {
  margin-left: auto;
}
</style>
