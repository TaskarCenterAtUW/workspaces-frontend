<template>
  <div class="btn-toolbar">
    <b-dropdown
      v-if="isOsw && rapid3Available"
      split
      split-class="tdei-toolbar-primary-button"
      toggle-class="tdei-toolbar-primary-button"
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
    <nuxt-link v-else class="btn tdei-toolbar-primary-button" :to="editRoute">
      <app-icon variant="edit_location_alt" size="24" />
      Edit
    </nuxt-link>
    <div class="btn-group ms-1">
      <nuxt-link
        class="btn tdei-secondary-button"
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
      <nuxt-link class="btn tdei-secondary-button" :to="exportRoute" :aria-disabled="!workspace.center">
        <app-icon variant="drive_folder_upload" size="24" no-margin />
        <span class="d-none d-sm-inline ms-2">Export</span>
      </nuxt-link>
    </div>
    <div class="btn-group ms-auto">
      <nuxt-link class="btn tdei-secondary-button" :to="settingsRoute">
        <app-icon variant="settings" size="24" no-margin />
        <span class="d-none d-sm-inline ms-2">Settings</span>
      </nuxt-link>
    </div><!-- .btn-group -->
  </div><!-- .btn-toolbar -->
</template>

<script setup lang="ts">
import { rapid3Manager } from '~/services/index'

const rapid3Available = !!rapid3Manager

const props = defineProps({
  workspace: {
    type: Object,
    required: true
  }
});

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
const exportRoute = computed(() => workspacePath('export'));
const settingsRoute = computed(() => workspacePath('settings'));

function workspacePath(page) {
  return `/workspace/${props.workspace.id}/${page}`;
}
</script>

<style lang="scss">
.tdei-toolbar-primary-button {
  background-color: var(--primary-color) !important;
  border-color: var(--primary-color) !important;
  color: #fff !important;
  font-weight: 600 !important;
  transition: background-color 0.18s ease, border-color 0.18s ease;

  &:hover,
  &:focus-visible,
  &:active {
    background-color: var(--brand-accent) !important;
    border-color: var(--brand-accent) !important;
    color: #fff !important;
  }
}

.btn-group > .tdei-toolbar-primary-button:first-child:not(:last-child) {
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}

.btn-group > .tdei-toolbar-primary-button:last-child:not(:first-child),
.dropdown > .btn-group > .tdei-toolbar-primary-button:last-child:not(:first-child) {
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
}
</style>
