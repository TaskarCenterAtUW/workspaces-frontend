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

            <label class="d-block mb-3">
              Project Group
              <project-group-picker
                v-model="projectGroupId"
                :disabled="context.active"
                required
              />
            </label>

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
                @change="onFileChange"
                :disabled="context.active"
                required
              >
            </label>
          </div><!-- .card-body -->

          <div class="card-footer">
            <template v-if="context.active">
              <app-spinner size="sm" />
              {{ context.status }}
            </template>
            <section v-else-if="context.error" class="alert alert-danger m-0" role="alert">
              <h5><app-icon variant="info" />An error occurred:</h5>
              <p class="mb-3">{{ context.error }}</p>
              <button class="btn btn-primary" @click="context.reset()">
                Try again
              </button>
            </section>
            <button
              v-else-if="!context.complete"
              type="submit"
              class="btn btn-primary"
              @click.prevent="create"
              :disabled="!complete || context.active"
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

const context = reactive(new FileImporterContext());
const importer = new FileImporter(workspacesClient, tdeiClient, osmClient, context);

const workspaceTitle = ref('');
const projectGroupId = ref(null);
const datasetType = ref(null);
const datasetFile = ref(null);

const complete = computed(() =>
  workspaceTitle.value.trim().length > 0
    && projectGroupId.value !== null
    && datasetType.value !== null
    && datasetFile.value instanceof File
    && datasetFile.value.name.endsWith('.zip')
);

function onFileChange(e) {
  datasetFile.value = e.target.files[0];
}

async function create() {
  const workspaceId = await importer.import(datasetFile.value, {
    title: workspaceTitle.value,
    type: datasetType.value,
    tdeiProjectGroupId: projectGroupId.value
  });

  if (workspaceId) {
    navigateTo('/dashboard?workspace=' + workspaceId);
  }
}
</script>

