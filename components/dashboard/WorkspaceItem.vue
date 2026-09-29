<template>
  <div class="workspace-card-container">
    <button
      class="workspace-card"
      :class="{
        'workspace-card-selected': selected
      }"
      type="button"
      :aria-label="workspaceAriaLabel"
      :aria-pressed="selected"
      @click="emit('select')"
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
          <span class="workspace-card-updated">Updated {{ updatedTime }}</span>
        </span>

        <dashboard-workspace-import-status-badge
          v-if="isImporting"
          class="workspace-card-import-status"
          status="in-progress"
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

    <button
      class="workspace-card-pin"
      type="button"
      :aria-label="pinAriaLabel"
      :aria-pressed="pinned"
      :title="pinAriaLabel"
      @click="emit('togglePin')"
    >
      <img
        :src="pinned ? pinnedIcon : unpinnedIcon"
        alt=""
        aria-hidden="true"
      >
    </button>
  </div>
</template>

<script setup lang="ts">
import dataTypeIcon from '~/assets/img/data-type.svg';
import listProjectsIcon from '~/assets/img/list-projects.svg';
import pinnedIcon from '~/assets/img/thumbtacks.svg';
import unpinnedIcon from '~/assets/img/thumbtacks-outline.svg';
import workspaceIcon from '~/assets/img/project.svg';
import { formatElapsed } from '~/util/time';

import type { Workspace } from '~/types/workspaces';

interface Props {
  pinned?: boolean;
  selected?: boolean;
  workspace: Workspace;
}

const props = withDefaults(defineProps<Props>(), {
  pinned: false,
  selected: false
});
const emit = defineEmits<{
  select: [];
  togglePin: [];
}>();

const updatedTime = computed(() => formatElapsed(
  props.workspace.updatedAt ?? props.workspace.createdAt
));
const isImporting = computed(() => props.workspace.importStatus === 'in-progress');
const workspaceAriaLabel = computed(() =>
  `Select workspace ${props.workspace.title}, ID ${props.workspace.id}${
    isImporting.value ? ', setup in progress' : ''
  }`
);
const pinAriaLabel = computed(() =>
  `${props.pinned ? 'Unpin' : 'Pin'} workspace ${props.workspace.title}`
);
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

$workspace-card-padding: 0.75rem;
$workspace-card-gap: 0.5rem;
$workspace-card-min-height: 6.85rem;
$workspace-card-icon-size: 2.1rem;
$workspace-card-radius: 0.625rem;
$workspace-card-title-size: 0.9375rem;
$workspace-card-copy-size: 0.8125rem;
$workspace-card-meta-size: 0.75rem;
$workspace-card-meta-icon-height: 0.85rem;

.workspace-card-container {
  position: relative;
}

.workspace-card {
  width: 100%;
  // min-height: $workspace-card-min-height;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 15px;
  padding: 15px;
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
  background: $purple-background-subtle;
  border-color: $border-strong;
}

.workspace-card-heading {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: $workspace-card-gap;
  padding-right: 45px;
}

.workspace-card-icon {
  width: $workspace-card-icon-size;
  height: $workspace-card-icon-size;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: $workspace-card-radius;
}

.workspace-card-import-status {
  align-self: center;
}

.workspace-card-icon img {
  width: 100%;
  height: 100%;
}

.workspace-card-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.workspace-card-copy strong {
  overflow: hidden;
  color: $text-navy;
  font-family: var(--primary-font-family);
  font-size: 1rem;
  font-weight: $font-weight-bold;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-card-import-status {
  max-width: 100%;
}

.workspace-card-updated,
.workspace-card-meta {
  color: $text-secondary;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
}

.workspace-card-meta {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: $spacer;
  padding-top: 15px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.25;
  border-top: $border-width dashed rgba($secondary, 0.2);
}

.workspace-card-meta > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.workspace-card-meta img {
  width: auto;
  height: 14px;
}

.workspace-card-chevron {
  margin-left: auto;
}

.workspace-card-pin {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: $text-secondary;
  background: transparent;
  border: 0;
  border-radius: 50%;
  transition: background-color 0.18s ease;
}

.workspace-card-pin img {
  width: 20px;
  height: 20px;
}

.workspace-card-pin:hover,
.workspace-card-pin:focus-visible {
  color: $primary;
  background: rgba($primary, 0.1);
  outline: none;
}

@include media-breakpoint-down(sm) {
  .workspace-card-meta {
    flex-wrap: wrap;
    row-gap: 0.5rem;
  }
}
</style>
