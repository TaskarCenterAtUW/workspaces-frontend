<template>
  <div class="btn-toolbar">
    <b-dropdown
      v-if="isOsw && rapid3Available"
      split
      variant="primary"
      :split-to="editRoute"
    >
      <template #button-content>
        <app-icon
          variant="edit_location_alt"
          size="24"
        />
        Edit
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
      class="btn btn-primary"
      :to="editRoute"
    >
      <app-icon
        variant="edit_location_alt"
        size="24"
      />
      Edit
    </nuxt-link>
    <div class="btn-group ms-1">
      <nuxt-link
        class="btn btn-outline-secondary"
        :to="projectsRoute"
      >
        <app-icon
          variant="dashboard"
          size="24"
          no-margin
        />
        <span class="d-none d-sm-inline ms-2">Projects</span>
      </nuxt-link>
      <nuxt-link
        class="btn btn-outline-secondary"
        :to="reviewRoute"
      >
        <app-icon
          variant="playlist_add_check"
          size="24"
          no-margin
        />
        <span class="d-none d-sm-inline ms-2">Review</span>
      </nuxt-link>
      <!--
      <a :href="tasksHref" class="btn" target="_blank">
        <app-icon variant="checklist" size="24" />
        <span class="d-none d-sm-inline">Tasks</span>
      </a>
      -->
      <nuxt-link
        class="btn btn-outline-secondary"
        :to="exportRoute"
        :aria-disabled="!workspace.center"
      >
        <app-icon
          variant="drive_folder_upload"
          size="24"
          no-margin
        />
        <span class="d-none d-sm-inline ms-2">Export</span>
      </nuxt-link>
    </div>
    <div class="btn-group ms-auto">
      <nuxt-link
        class="btn btn-outline-secondary"
        :to="settingsRoute"
      >
        <app-icon
          variant="settings"
          size="24"
          no-margin
        />
        <span class="d-none d-sm-inline ms-2">Settings</span>
      </nuxt-link>
    </div><!-- .btn-group -->
  </div><!-- .btn-toolbar -->
</template>

<script setup lang="ts">
import { rapid3Manager } from '~/services/index'
import type { Workspace } from '~/types/workspaces';

const rapid3Available = !!rapid3Manager

interface Props {
  workspace: Workspace;
}

const props = defineProps<Props>();

const editHash = computed(() => {
  if (!props.workspace.center) {
    return undefined;
  }

  const { zoom, latitude, longitude } = props.workspace.center;

  return `#map=${zoom}/${latitude}/${longitude}`;
});

const isOsw = computed(() => props.workspace.type === 'osw');

const editRoute = computed(() => ({
  path: workspacePath('edit'),
  query: { datatype: props.workspace.type },
  hash: editHash.value
}));

const editRouteRapid3 = computed(() => ({
  path: workspacePath('edit'),
  query: { datatype: props.workspace.type, editor: 'rapid3' },
  hash: editHash.value
}));

const reviewRoute = computed(() => workspacePath('review'));
const projectsRoute = computed(() => workspacePath('projects'));
const exportRoute = computed(() => workspacePath('export'));
const settingsRoute = computed(() => workspacePath('settings'));

function workspacePath(page: string) {
  return `/workspace/${props.workspace.id}/${page}`;
}
</script>
