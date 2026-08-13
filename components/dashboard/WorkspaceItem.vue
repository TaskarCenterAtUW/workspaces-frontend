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

      <span
        v-if="selected"
        class="workspace-card-selected-icon"
        aria-hidden="true"
      />
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
import { formatElapsed } from '~/util/time';

import type { Workspace } from '~/types/workspaces';

interface Props {
  selected?: boolean;
  workspace: Workspace;
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
});

const createdTime = computed(() => formatElapsed(props.workspace.createdAt));
const typeLabel = computed(() => props.workspace.type.toUpperCase());
const projectLabel = computed(() => {
  if (props.workspace.projectsCount == null) {
    return 'Projects';
  }

  const count = props.workspace.projectsCount;
  return `${count} ${count === 1 ? 'Project' : 'Projects'}`;
});
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

$workspace-card-padding: 0.8rem;
$workspace-card-gap: 0.7rem;
$workspace-card-min-height: 7.85rem;
$workspace-card-icon-size: 2.1rem;
$workspace-card-radius: 0.625rem;
$workspace-card-title-size: 1rem;
$workspace-card-copy-size: 0.9rem;
$workspace-card-meta-size: 0.75rem;
$workspace-card-selected-icon-size: 1.3rem;
$workspace-card-meta-icon-height: 0.85rem;

.workspace-card {
  width: 100%;
  min-height: $workspace-card-min-height;
  display: grid;
  gap: $workspace-card-gap;
  padding: $workspace-card-padding;
  color: $text-navy;
  text-align: left;
  background: $surface-card;
  border: $border-width solid $border-strong;
  border-radius: $workspace-card-radius;
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
  border-color: $border-strong;
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
  font-family: var(--primary-font-family);
  font-size: $workspace-card-title-size;
  font-weight: $font-weight-bold;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-card-copy span,
.workspace-card-meta {
  color: $text-secondary;
  font-family: var(--primary-font-family);
  font-size: $workspace-card-copy-size;
  font-weight: 500;
  line-height: 1.4444;
}

.workspace-card-selected-icon {
  width: $workspace-card-selected-icon-size;
  height: $workspace-card-selected-icon-size;
  color: $primary;
  background-color: currentColor;
  mask: url("~/assets/img/selected-workspace.svg") center / contain no-repeat;
}

.workspace-card-meta {
  display: flex;
  align-items: center;
  gap: $spacer;
  padding-top: 0.6rem;
  font-size: $workspace-card-meta-size;
  line-height: 1.25;
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
