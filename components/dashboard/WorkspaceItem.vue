<template>
  <button :class="getClasses(workspace)">
    <div class="fw-bold">
      {{ workspace.title }}
    </div>

    <span class="badge bg-secondary"><app-icon variant="insert_drive_file" />{{ workspace.type }}</span>

    <span
      v-if="workspace.externalAppAccess > 0"
      class="badge bg-success ms-2"
    >
      <app-icon
        v-if="workspace.externalAppAccess === 1"
        variant="public"
      />
      <app-icon
        v-else
        variant="lock"
      />
      App
    </span>
  </button>
</template>

<script setup lang="ts">
const props = defineProps({
  workspace: {
    type: Object,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
})

function getClasses() {
  return {
    'list-group-item': true,
    'list-group-item-action': true,
    'active': props.selected,
  }
}
</script>

<style lang="scss">
.dashboard-page {
  .list-group-item {
    cursor: pointer;

    &.active {
      position: sticky;
      top: 1rem;
      bottom: 1rem;
    }

    .badge {
      text-transform: uppercase;
    }
  }
}
</style>
