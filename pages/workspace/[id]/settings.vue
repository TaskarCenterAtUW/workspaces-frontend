// Test outline
// @test e2e: the workspace can be renamed with the "Workspace Title" field in the settings, then clicking "Rename"
// @test e2e: when submitting the form, a success toast appears and in error an error toast appears (playwright snapshot both states);
//            test this for all three forms on the settings page (general, external apps and delete)
// @test e2e: Under "External Apps", turning off "Publish this workspace" disables the other buttons and when clicking "Save" shows a
//            confirmation and sends the proper API call to the server (Swagger here: https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
// @test e2e: Under "External Apps", turning on "Publish this workspace" enables the other buttons and when clicking "Save" shows a confirmation and sends
//            the proper API call.
// @test e2e: While External Apps settings are being saved, the Save button is disabled and displays "Saving..." to prevent duplicate submissions.
// @test e2e: the "Custom Imagery" box is validated against the JSON schema here (https://raw.githubusercontent.com/TaskarCenterAtUW/asr-imagery-list/refs/heads/main/schema/schema.json),
//            and a toast shown when it passes and the API call to set its value is successful on the backend.
// @test e2e: Clicking "I understand and want to delete this workspace" shows a modal that requires the user to type in the word "delete", and when confirmed sends the proper API
//            response and redirects to the dashboard.
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json) and that success
//            and error states are handled properly with toasts (playwright snapshot these)

<template>
  <app-page
    fluid
    class="workspace-edit-page"
  >
    <div class="workspace-settings-header">
      <nav
        class="workspace-settings-breadcrumbs"
        aria-label="Breadcrumb"
      >
        <nuxt-link :to="workspaceRoute">Workspaces</nuxt-link>
        <span aria-hidden="true">&gt;</span>
        <nuxt-link>{{ workspace.title }}</nuxt-link>
      </nav>
      <h1 class="workspace-heading">
        Workspace Settings
      </h1>
    </div>
    <div class="row align-items-start">
      <div class="col-lg-3 workspace-setting-tab-column">
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
const workspaceRoute = `/dashboard`;
// reactive so child panels (e.g. the External Apps publish toggle) can react to
// changes to the provided workspace.
const workspace = reactive(await workspacesClient.getWorkspace(workspaceId));

provide('workspace', workspace);
</script>

<script lang="ts">
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";
.drag-over {
  border-style: dashed;
  border-color: var(--bs-primary);
  background-color: var(--bs-light);
}
.workspace-settings-breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
  color: $text-secondary;
  font-size: 14px;
  font-weight: 500;
}

.workspace-settings-breadcrumbs a {
  color: inherit;
  text-decoration: none;
}
.workspace-heading {
  font-size: 26px;
  font-weight: 600;
  margin-bottom: 0px;
}
.workspace-settings-header {
  padding: 25px 30px;
  border-bottom: 1px solid rgba(26, 30, 61, 0.08);
  margin-bottom: 0px;
}
.workspace-edit-page {
  padding: 0px 0px !important;
}
.workspace-setting-tab-column {
  padding: 30px 30px;
}
</style>
