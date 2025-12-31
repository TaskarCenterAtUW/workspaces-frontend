<template>
  <div class="btn-toolbar">
    <nuxt-link
      class="btn btn-dark"
      :to="editRoute"
    >
      <app-icon
        variant="edit_location_alt"
        size="24"
      />
      Edit
    </nuxt-link>
    <div class="btn-group">
      <!--
      <a :href="tasksHref" class="btn" target="_blank">
        <app-icon variant="checklist" size="24" />
        <span class="d-none d-sm-inline">Tasks</span>
      </a>
      -->
      <nuxt-link
        class="btn"
        :to="exportRoute"
        :aria-disabled="!workspace.center"
      >
        <app-icon
          variant="drive_folder_upload"
          size="24"
        />
        <span class="d-none d-sm-inline">Export</span>
      </nuxt-link>
    </div>
    <div class="btn-group ms-auto">
      <nuxt-link
        class="btn"
        :to="settingsRoute"
      >
        <app-icon
          variant="settings"
          size="24"
        />
        <span class="d-none d-sm-inline">Settings</span>
      </nuxt-link>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  workspace: {
    type: Object,
    required: true,
  },
})

const editHash = computed(() => {
  if (!props.workspace.center) {
    return undefined
  }

  const { zoom, latitude, longitude } = props.workspace.center

  return `#map=${zoom}/${latitude}/${longitude}`
})

const editRoute = computed(() => ({
  path: workspacePath('edit'),
  query: { datatype: props.workspace.type },
  hash: editHash.value,
}))

const exportRoute = computed(() => workspacePath('export'))
const settingsRoute = computed(() => workspacePath('settings'))

function workspacePath(page) {
  return `/workspace/${props.workspace.id}/${page}`
}
</script>
