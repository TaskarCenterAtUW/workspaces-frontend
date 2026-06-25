// Test outline
// @test e2e: the "from blank workspace" button takes you to a form that allows you to set the title, workspace type and project group, and submitting
//             creates a new workspace and takes you to the dashboard with the new workspace selected (playwright snapshot the form and loading state)
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
// @test e2e: if an API error occurs when creating a workspace from either form, an error message is shown

<template>
  <app-page class="create-blank-page">
    <h1 class="mb-5 h2 text-lg-center">Create a Blank Workspace</h1>

    <div class="row">
      <div class="col-xxl-7 mx-auto">
        <div class="card mb-3">
          <div class="card-body">
            <label class="d-block mb-3">
              Workspace Title
              <input
                v-model.trim="workspaceTitle"
                class="form-control"
              >
            </label>

            <div class="mb-3">
              <label
                class="d-block"
                for="create_blank_project_group"
              >
                Project Group
              </label>
              <project-group-picker
                id="create_blank_project_group"
                v-model="projectGroupId"
              />
            </div>

            <div>Dataset Type</div>
            <dataset-type-radio
              v-model="datasetType"
              class="mb-3"
            />
          </div><!-- .card-body -->

          <div class="card-footer">
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="!complete"
              @click="create"
            >
              <app-spinner
                v-if="creating.active"
                size="sm"
              />
              <template v-else>Create Workspace</template>
            </button>
          </div><!-- .card-footer -->
        </div><!-- .card -->
      </div><!-- .col -->
    </div><!-- .row -->
  </app-page>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading';
import { workspacesClient } from '~/services/index';
import type { WorkspaceType } from '~/types/workspaces';
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

const creating = reactive(new LoadingContext());
const workspaceTitle = ref('');
const projectGroupId = ref<string | undefined>();
const datasetType = ref<string | null>('osw');

const complete = computed(() =>
  workspaceTitle.value.trim().length > 0
  && projectGroupId.value != null
  && datasetType.value !== null
);

async function create() {
  if (workspaceTitle.value.trim().length === 0) {
    return;
  }

  try {
    await creating.wrap(workspacesClient, async (client) => {
      await client.createWorkspace({
        title: workspaceTitle.value,
        type: datasetType.value as WorkspaceType,
        tdeiProjectGroupId: projectGroupId.value!
      });
    });
  } catch (e) {
    toast.error(`Error creating workspace: ${e instanceof Error ? e.message : e}`);
    return;
  }

  navigateTo('/dashboard');
}
</script>
