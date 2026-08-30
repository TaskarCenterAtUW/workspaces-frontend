// Test outline
// @test e2e: the "from blank workspace" button takes you to a form that allows you to set the title, workspace type and project group, and submitting
//             creates a new workspace and takes you to the dashboard with the new workspace selected (playwright snapshot the form and loading state)
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
// @test e2e: if an API error occurs when creating a workspace from either form, an error message is shown

<template>
  <app-page class="create-workspace-blank-page">
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
          <h1 class="create-workspace-card-title">Create a Blank Workspace</h1>
          <p class="create-workspace-card-desc">Create an empty workspace with no data. Add your data when ready.</p>
        </div>
        <div class="card-body">
          <label class="d-block mb-3 input-label">
            Workspace Title
            <input
              v-model.trim="workspaceTitle"
              placeholder="Enter a title for your workspace"
              class="form-control"
            >
          </label>

          <div class="mb-3">
            <label
              class="d-block input-label"
              for="create_blank_project_group"
            >
              Project Group
            </label>
            <project-group-picker
              id="create_blank_project_group"
              v-model="projectGroupId"
            />
          </div>

          <div class="input-label">Dataset Type</div>
          <dataset-type-radio
            v-model="datasetType"
            class="mb-3"
          />

            <div class="info-what-next-card">
              <img
                :src="infoIcon"
                class="info-what-next-card-icon"
                alt=""
              >
              <div class="info-what-next-card-content">
                <div class="info-what-next-card-title">What's next?</div>
                <div class="info-what-next-card-desc">You can create projects, tasks, add team members, add additional settings after creating your workspace.</div>
              </div>
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
    </div>
  </app-page>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading';
import { workspacesClient } from '~/services/index';
import type { WorkspaceType } from '~/types/workspaces';
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import infoIcon from '~/assets/img/info-icon.svg';

const creating = reactive(new LoadingContext());
const workspaceTitle = ref('');
const projectGroupId = ref<string | null>(null);
const datasetType = ref<string | null>('osw');

const complete = computed(() =>
  workspaceTitle.value.trim().length > 0
  && projectGroupId.value != null
  && datasetType.value !== null
);

async function handleCancel() {
  await navigateTo('/dashboard');
}

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

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";
.create-workspace-blank-page {
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

</style>
