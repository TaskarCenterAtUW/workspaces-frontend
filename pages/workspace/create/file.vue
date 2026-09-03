// Test outline
// @test e2e: the "from file" button takes you to a form that allows you to set a title, workspace type, project group, and upload a file, and submitting creates a
//             new workspace and takes you to the dashboard with the new workspace selected (playwright snapshot the form and loading state)
// @test e2e: test that both a valid file upload and an invalid file upload (e.g. wrong file type) are handled correctly, with the valid file successfully creating a
//            workspace and the invalid file showing an error message (playwright snapshot both scenarios)
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
// @test e2e: if an API error occurs when creating a workspace from either form, an error message is shown

<template>
  <app-page class="create-workspace-file-page">
    <workspace-creation-modal
      ref="creationInitiatedModal"
      :workspace-id="createdWorkspaceId"
    />
    <button
      class="btn btn-link btn-back-to-workspace"
      type="button"
      @click="handleCancel"
    >
      <app-icon
        class="create-workspace-chevron"
        variant="chevron_left"
        no-margin
      />
      Back to workspaces
    </button>
    <div class="create-workspace-card-container">
      <div class="card create-workspace-card">
        <div class="creat-workspace-card-header">
          <h1 class="create-workspace-card-title">Create a Workspace from a File</h1>
          <p class="create-workspace-card-desc">Create a workspace from an OpenSidewalks data file on your computer.</p>
        </div>
        <div class="card-body">
          <label class="d-block mb-3 input-label">
            Workspace Title
            <input
              v-model.trim="workspaceTitle"
              class="form-control"
              :disabled="context.active || createdWorkspaceId !== undefined"
              required
            >
          </label>

          <div class="mb-3">
            <label
              class="d-block input-label"
              for="create_file_project_group"
            >
              Project Group
            </label>
            <project-group-picker
              id="create_file_project_group"
              v-model="projectGroupId"
              :disabled="context.active || createdWorkspaceId !== undefined"
              required
            />
          </div>

          <div class="input-label">Dataset Type</div>
          <dataset-type-radio
            v-model="datasetType"
            class="mb-3"
            :disabled="context.active || createdWorkspaceId !== undefined"
            required
          />

          <label class="d-block input-label">
            Dataset File
            <input
              type="file"
              class="form-control"
              accept=".zip"
              :disabled="context.active || createdWorkspaceId !== undefined"
              required
              @change="onFileChange"
            >
          </label>
          <p
            v-if="archiveChecking"
            class="text-secondary mt-2 mb-0"
            role="status"
          >
            Checking ZIP contents...
          </p>
          <div
            v-else-if="archiveWarning"
            class="alert alert-warning mt-2 mb-0"
            role="alert"
          >
            {{ archiveWarning }}
          </div>
        </div><!-- .card-body -->
        <div class="card-footer">
          <button
            class="btn btn-link create-workspace-cancel-btn"
            type="button"
            @click="handleCancel"
          >
            Cancel
          </button>
          <template v-if="context.active">
            <app-spinner size="sm" />
            {{ context.status }}
          </template>
          <section
            v-else-if="context.error"
            class="error-block"
          >
            <div
              class="alert alert-danger m-0 error-card"
              role="alert"
            >
              <h6><app-icon variant="info" />An error occurred:</h6>
              <div>{{ context.error }}</div>
            </div>
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
    </div><!-- .row -->
  </app-page>
</template>

<script setup lang="ts">
import {
  FileImporter,
  FileImporterContext,
  getDatasetArchiveWarning,
  inspectDatasetArchive
} from '~/services/import/file';
import { workspacesClient } from '~/services/index';
import type { WorkspaceCreationModal } from '#components';
import type { DatasetArchiveInspection } from '~/services/import/file';
import type { WorkspaceType } from '~/types/workspaces';
import type { ComponentExposed } from 'vue-component-type-helpers';
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

const context = reactive(new FileImporterContext());
const importer = new FileImporter(workspacesClient, context);

const createdWorkspaceId = ref<number | undefined>();
const creationInitiatedModal = useTemplateRef<ComponentExposed<typeof WorkspaceCreationModal>>('creationInitiatedModal');

const workspaceTitle = ref('');
const projectGroupId = ref<string | null>(null);
const datasetType = ref<string | null>(null);
const datasetFile = ref<File | null>(null);
const archiveInspection = ref<DatasetArchiveInspection | null>(null);
const archiveChecking = ref(false);
const archiveReadError = ref<string | null>(null);
let archiveInspectionId = 0;

const archiveWarning = computed(() => {
  if (archiveReadError.value) {
    return archiveReadError.value;
  }

  if (!archiveInspection.value) {
    return null;
  }

  return getDatasetArchiveWarning(
    archiveInspection.value,
    datasetType.value as WorkspaceType | null
  );
});

const complete = computed(() =>
  workspaceTitle.value.trim().length > 0
  && projectGroupId.value != null
  && datasetType.value !== null
  && datasetFile.value instanceof File
  && datasetFile.value.name.toLowerCase().endsWith('.zip')
  && archiveInspection.value !== null
  && !archiveChecking.value
  && archiveWarning.value === null
);

async function onFileChange(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  const inspectionId = ++archiveInspectionId;

  archiveInspection.value = null;
  archiveReadError.value = null;
  archiveChecking.value = false;

  if (file && !file.name.toLowerCase().endsWith('.zip')) {
    toast.error('Only .zip files are supported. Please choose a .zip file.');
    input.value = '';
    datasetFile.value = null;
    return;
  }

  datasetFile.value = file;

  if (!file) {
    return;
  }

  archiveChecking.value = true;

  try {
    const inspection = await inspectDatasetArchive(file);
    if (inspectionId === archiveInspectionId) {
      archiveInspection.value = inspection;
    }
  } catch {
    if (inspectionId === archiveInspectionId) {
      archiveReadError.value = 'This file is not a valid ZIP archive.';
    }
  } finally {
    if (inspectionId === archiveInspectionId) {
      archiveChecking.value = false;
    }
  }
}

async function handleCancel() {
  await navigateTo('/dashboard');
}

async function create() {
  const workspaceId = await importer.import(datasetFile.value!, {
    title: workspaceTitle.value,
    type: datasetType.value as WorkspaceType,
    tdeiProjectGroupId: projectGroupId.value!
  });

  if (workspaceId !== undefined) {
    createdWorkspaceId.value = workspaceId;
    await nextTick();
    creationInitiatedModal.value?.show();
  }
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";
.create-workspace-file-page {
  background-color: #F5F5F5;
  max-width: 100%;
  height: 100%;
  position: relative;
}
.create-workspace-card-container {
  height: 100%;
  padding: 10px 0px;
  .input-label {
    font-weight: 500;
    margin-bottom: 8px;
    color: $text-navy;
  }
}
.create-workspace-card {
  max-width: 620px;
  width: 100%;
  margin: 0 auto;
  border-radius: 15px;
  overflow: auto;
}
.creat-workspace-card-header {
  padding: 20px 15px;
  border-bottom: 1px solid #D6D6D6;
  background: #eeeaff;
}
.create-workspace-card-title {
  font-size: 20px;
  font-weight: 600;
  color: $text-navy;
  margin-bottom: 5px;
}
.create-workspace-card-desc {
  font-size: 14px;
  color: $text-secondary;
  font-weight: 500;
  margin-bottom: 0px;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  padding: 15px 20px;
  background-color: #ffffff;
  border-radius: 0px 0px 15px 15px;
}
.create-workspace-cancel-btn {
  color: $text-secondary;
  font-weight: 600;
  text-decoration: none;
  padding: 0px;
}
.btn-back-to-workspace {
  position: absolute;
  top: 20px;
  font-weight: 600;
  font-size: 16px;
  text-decoration: none;
  color: $text-secondary;
  display: flex;
  align-items: center;
}
.create-workspace-chevron {
  font-size: 26px;
}
.info-what-next-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 12px;
  border-radius: 8px;
  margin-top: 25px;
  border: 1px solid #e5e6e7;
}
.info-what-next-card-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 2px;
}
.info-what-next-card-desc {
  font-size: 14px;
  font-weight: 400;
  color: $text-secondary;
}
.info-what-next-card-icon {
  height: 40px;
}
.error-block {
  display: flex;
  align-items: center;
  gap: 10px;
}
.error-card {
  padding: 5px 10px;
  font-size: 14px;
}
</style>
