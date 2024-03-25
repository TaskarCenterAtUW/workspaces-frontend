<template>
  <app-page class="create-blank-page">
    <h1 class="mb-5 h2 text-lg-center">Create a Blank Workspace</h1>

    <div class="row">
      <div class="col-xxl-7 mx-auto">
        <div class="card mb-3">
          <div class="card-body">
            <label class="d-block mb-3">
              Workspace Title
              <input v-model.trim="workspaceTitle" class="form-control" />
            </label>

            <label class="d-block mb-3">
              Project Group
              <project-group-picker v-model="projectGroupId" />
            </label>

            <div>Dataset Type</div>
            <dataset-type-radio v-model="datasetType" class="mb-3" />
          </div><!-- .card-body -->

          <div class="card-footer">
            <button type="submit" class="btn btn-primary" :disabled="!complete" @click="create">
              <app-spinner v-if="creating.active" size="sm" />
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

const creating = reactive(new LoadingContext());
const workspaceTitle = ref('');
const projectGroupId = ref(null);
const datasetType = ref('osw');

const complete = computed(() =>
  workspaceTitle.value.trim().length > 0
    && projectGroupId.value !== null
    && datasetType.value !== null
);

async function create() {
  if (workspaceTitle.value.trim().length === 0) {
    return;
  }

  await creating.wrap(workspacesClient, async (client) => {
    await client.createWorkspace({
      title: workspaceTitle.value,
      type: datasetType.value,
      tdeiProjectGroupId: projectGroupId.value
    });
  });

  navigateTo('/dashboard');
}
</script>
