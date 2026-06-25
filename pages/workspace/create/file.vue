// Test outline
// @test e2e: the "from file" button takes you to a form that allows you to set a title, workspace type, project group, and upload a file, and submitting creates a
//             new workspace and takes you to the dashboard with the new workspace selected (playwright snapshot the form and loading state)
// @test e2e: test that both a valid file upload and an invalid file upload (e.g. wrong file type) are handled correctly, with the valid file successfully creating a
//            workspace and the invalid file showing an error message (playwright snapshot both scenarios)
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
// @test e2e: if an API error occurs when creating a workspace from either form, an error message is shown

<template>
  <app-page class="create-file-page">
    <h1 class="mb-5 h2 text-lg-center">Create a Workspace from a File</h1>

    <div class="row">
      <div class="col-xxl-7 mx-auto">
        <div class="card mb-3">
          <div class="card-body">
            <label class="d-block mb-3">
              Workspace Title
              <input
                v-model.trim="workspaceTitle"
                class="form-control"
                :disabled="context.active"
                required
              >
            </label>

            <div class="mb-3">
              <label
                class="d-block"
                for="create_file_project_group"
              >
                Project Group
              </label>
              <project-group-picker
                id="create_file_project_group"
                v-model="projectGroupId"
                :disabled="context.active"
                required
              />
            </div>

            <div>Dataset Type</div>
            <dataset-type-radio
              v-model="datasetType"
              class="mb-3"
              :disabled="context.active"
              required
            />

            <label class="d-block">
              Dataset File
              <input
                type="file"
                class="form-control"
                accept=".zip"
                :disabled="context.active"
                required
                @change="onFileChange"
              >
            </label>
          </div><!-- .card-body -->

          <div class="card-footer">
            <template v-if="context.active">
              <app-spinner size="sm" />
              {{ context.status }}
            </template>
            <section
              v-else-if="context.error"
              class="alert alert-danger m-0"
              role="alert"
            >
              <h5><app-icon variant="info" />An error occurred:</h5>
              <p class="mb-3">{{ context.error }}</p>
              <button
                class="btn btn-primary"
                @click="context.reset()"
              >
                Try again
              </button>
            </section>
            <button
              v-else-if="!context.complete"
              type="submit"
              class="btn btn-primary"
              :disabled="!complete || context.active"
              @click.prevent="create"
            >
              Create Workspace
            </button>
          </div><!-- .card-footer -->
        </div><!-- .card -->
      </div><!-- .col -->
    </div><!-- .row -->
  </app-page>
</template>

<script setup lang="ts">
import { FileImporter, FileImporterContext } from '~/services/import/file';
import { osmClient, tdeiClient, workspacesClient } from '~/services/index';
import type { WorkspaceType } from '~/types/workspaces';
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

const context = reactive(new FileImporterContext());
const importer = new FileImporter(workspacesClient, tdeiClient, osmClient, context);

const workspaceTitle = ref('');
const projectGroupId = ref<string | null>(null);
const datasetType = ref<string | null>(null);
const datasetFile = ref<File | null>(null);

const complete = computed(() =>
  workspaceTitle.value.trim().length > 0
  && projectGroupId.value != null
  && datasetType.value !== null
  && datasetFile.value instanceof File
  && datasetFile.value.name.endsWith('.zip')
);

function onFileChange(e: any) {
  const file = e.target.files[0];

  if (file && !file.name.endsWith('.zip')) {
    toast.error('Only .zip files are supported. Please choose a .zip file.');
    e.target.value = '';
    datasetFile.value = null;
    return;
  }

  datasetFile.value = file;
}

async function create() {
  const workspaceId = await importer.import(datasetFile.value!, {
    title: workspaceTitle.value,
    type: datasetType.value as WorkspaceType,
    tdeiProjectGroupId: projectGroupId.value!
  });

  if (workspaceId) {
    navigateTo('/dashboard?workspace=' + workspaceId);
  }
}
</script>
