<template>
  <app-page>
    <h2 class="mb-4">
      Workspace Settings
    </h2>

    <div class="row align-items-start">
      <div class="col-lg-3">
        <settings-nav />
      </div>

      <nuxt-page />
    </div><!-- .row -->
  </app-page>
</template>

<script setup lang="ts">
import { workspacesClient } from '~/services/index';

const route = useRoute();
const workspaceId = Number(route.params.id);
const workspace = await workspacesClient.getWorkspace(workspaceId);

provide('workspace', workspace);
</script>

<script lang="ts">
</script>

<style scoped>
.drag-over {
  border-style: dashed;
  border-color: var(--bs-primary);
  background-color: var(--bs-light);
}
</style>
