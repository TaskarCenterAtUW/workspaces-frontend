<template>
  <div
    class="dashboard-toolbar"
    aria-label="Workspace actions"
  >
    <nuxt-link
      class="btn btn-outline-secondary dashboard-toolbar-button"
      :to="projectsRoute"
    >
      <img
        class="dashboard-toolbar-icon"
        :src="projectsIcon"
        alt=""
      >
      Projects
    </nuxt-link>

    <b-dropdown
      v-if="isOsw && rapid3Available"
      split
      split-variant="outline-secondary"
      variant="outline-secondary"
      :split-to="editRoute"
      class="dashboard-editor-dropdown"
    >
      <template #button-content>
        <app-icon
          variant="edit_location_alt"
          size="20"
          no-margin
        />
        Rapid Editor
      </template>
      <b-dropdown-item :to="editRoute">
        Rapid 2 (default)
      </b-dropdown-item>
      <b-dropdown-item :to="editRouteRapid3">
        Rapid 3 (beta)
      </b-dropdown-item>
    </b-dropdown>

    <nuxt-link
      v-else
      class="btn btn-outline-secondary dashboard-toolbar-button"
      :to="editRoute"
    >
      <app-icon
        variant="edit_location_alt"
        size="20"
        no-margin
      />
      {{ editorLabel }}
    </nuxt-link>

    <b-dropdown
      class="dashboard-more-dropdown"
      toggle-class="dashboard-more-toggle"
      variant="outline-secondary"
      placement="bottom-end"
      no-caret
    >
      <template #button-content>
        <app-icon
          variant="more_vert"
          size="22"
          no-margin
        />
        <span class="visually-hidden">More workspace actions</span>
      </template>

      <b-dropdown-item :to="reviewRoute">
        <app-icon variant="playlist_add_check" />
        Review
      </b-dropdown-item>
      <b-dropdown-item
        :to="exportRoute"
        :disabled="!workspace.center"
      >
        <app-icon variant="drive_folder_upload" />
        Export
      </b-dropdown-item>
      <b-dropdown-item :to="settingsRoute">
        <app-icon variant="settings" />
        Settings
      </b-dropdown-item>
    </b-dropdown>
  </div>
</template>

<script setup lang="ts">
import projectsIcon from '~/assets/img/list-projects.svg';
import { rapid3Manager } from '~/services/index';

import type { Workspace } from '~/types/workspaces';

interface Props {
  workspace: Workspace;
}

const props = defineProps<Props>();
const rapid3Available = Boolean(rapid3Manager);

const editHash = computed(() => {
  if (!props.workspace.center) {
    return undefined;
  }

  const { zoom, latitude, longitude } = props.workspace.center;
  return `#map=${zoom}/${latitude}/${longitude}`;
});

const isOsw = computed(() => props.workspace.type === 'osw');
const editorLabel = computed(() => {
  switch (props.workspace.type) {
    case 'osw':
      return 'Rapid Editor';
    case 'pathways':
      return 'Pathways Editor';
    case 'flex':
    default:
      return 'Editor';
  }
});
const editRoute = computed(() => ({
  path: workspacePath('edit'),
  query: { datatype: props.workspace.type },
  hash: editHash.value,
}));
const editRouteRapid3 = computed(() => ({
  path: workspacePath('edit'),
  query: { datatype: props.workspace.type, editor: 'rapid3' },
  hash: editHash.value,
}));
const reviewRoute = computed(() => workspacePath('review'));
const projectsRoute = computed(() => workspacePath('projects'));
const exportRoute = computed(() => workspacePath('export'));
const settingsRoute = computed(() => workspacePath('settings'));

function workspacePath(page: string): string {
  return `/workspace/${props.workspace.id}/${page}`;
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

$dashboard-toolbar-gap: 0.5rem;
$dashboard-toolbar-control-height: 2.35rem;
$dashboard-toolbar-radius: 0.375rem;
$dashboard-toolbar-button-padding: 0.4rem 0.75rem;
$dashboard-toolbar-shadow: 0 0.0625rem 0.375rem rgba($black, 0.05);
$dashboard-toolbar-border: rgba($secondary, 0.22);

.dashboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: $dashboard-toolbar-gap;
}

.dashboard-toolbar-button {
  height: $dashboard-toolbar-control-height;
  min-height: $dashboard-toolbar-control-height;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: $dashboard-toolbar-button-padding;
  color: $secondary;
  background: $white;
  border-color: $dashboard-toolbar-border;
  border-radius: $dashboard-toolbar-radius;
  box-shadow: $dashboard-toolbar-shadow;
  font-size: 0.9rem;
}

.dashboard-toolbar-icon {
  width: 1rem;
  height: auto;
}

.dashboard-editor-dropdown,
.dashboard-more-dropdown {
  flex-shrink: 0;
}

.dashboard-editor-dropdown :deep(.btn),
.dashboard-more-dropdown :deep(.dashboard-more-toggle) {
  height: $dashboard-toolbar-control-height;
  min-height: $dashboard-toolbar-control-height;
  color: $secondary;
  background: $white;
  border-color: $dashboard-toolbar-border;
  box-shadow: $dashboard-toolbar-shadow;
  font-size: 0.9rem;
}

.dashboard-editor-dropdown :deep(.btn:first-child) {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: $dashboard-toolbar-button-padding;
  border-radius: $dashboard-toolbar-radius 0 0 $dashboard-toolbar-radius;
}

.dashboard-editor-dropdown :deep(.dropdown-toggle-split) {
  width: 2.1rem;
  padding: 0;
  border-radius: 0 $dashboard-toolbar-radius $dashboard-toolbar-radius 0;
}

.dashboard-more-dropdown :deep(.dashboard-more-toggle) {
  min-width: $dashboard-toolbar-control-height;
  padding: 0;
  border-radius: $dashboard-toolbar-radius;
}

.dashboard-more-dropdown :deep(.dropdown-menu) {
  min-width: 12rem;
}

.dashboard-more-dropdown :deep(.dropdown-item) {
  padding: 0.65rem 1rem;
  color: $secondary;
}

@include media-breakpoint-down(sm) {
  .dashboard-toolbar {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .dashboard-toolbar-button,
  .dashboard-editor-dropdown {
    flex: 1 1 auto;
  }
}
</style>
