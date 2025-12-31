<template>
  <app-page>
    <div class="text-center mt-5">
      <app-icon variant="drive_folder_upload" size="48" />
    </div>
    <h1 class="mb-5 text-center">Export Workspace to TDEI</h1>

    <div class="row row-cols-1 row-cols-md-2 g-4">
      <div class="col mx-auto">
        <div v-if="workspace.type === 'pathways' && !workspace.tdeiRecordId" class="card">
          <div class="card-body">
            <p>
              This GTFS Pathways workspace is not derived from a TDEI dataset and
              lacks information needed to pass TDEI validaion.
            </p>
          </div>
          <div class="card-footer">
            <nuxt-link to="../" class="btn btn-primary">
              <app-icon variant="arrow_circle_left" no-margin />
              Go back
            </nuxt-link>
          </div>
        </div>

        <form v-else class="card">
          <fieldset class="card-body" :disabled="context.active || context.error">
            <label class="d-block">
              Dataset Name
              <input v-model.trim="datasetName" class="form-control" >
            </label>
            <label class="d-block mt-3">
              Project Group
              <project-group-picker v-model="workspace.tdeiProjectGroupId" />
            </label>
            <label class="d-block mt-3">
              Service
              <service-picker
                v-model="workspace.tdeiServiceId"
                :project-group-id="workspace.tdeiProjectGroupId"
                :service-type="workspace.type"
              />
            </label>
            <label class="d-block mt-3">
              Dataset Version
              <input v-model.trim="datasetVersion" class="form-control" >
            </label>
          </fieldset>
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
              :disabled="context.active"
              @click.prevent="upload"
            >
              Upload
              <app-icon variant="arrow_circle_right" no-margin />
            </button>
          </div><!-- .card-footer -->
        </form><!-- .card -->
      </div><!-- .col -->
    </div><!-- .row -->
  </app-page>
</template>

<script setup lang="ts">
import { osmClient, tdeiClient, workspacesClient } from '~/services/index'
import { TdeiExporter, TdeiExporterContext } from '~/services/export/tdei'
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

const context = reactive(new TdeiExporterContext());
const exporter = new TdeiExporter(tdeiClient, osmClient, context);

const route = useRoute();
const workspaceId = route.params.id;
const workspace = reactive(await workspacesClient.getWorkspace(workspaceId));
const oldMetadata = workspace.tdeiMetadata ? JSON.parse(workspace.tdeiMetadata) : {};

const datasetName = ref(workspace.title);
const datasetVersion = ref(oldMetadata.metadata?.dataset_detail?.version);

async function upload() {
  // TODO: enable metadata customization
	const metadata = {
		"name": datasetName.value,
		"version": datasetVersion.value,
		"description": oldMetadata.description ?? '',
		"collected_by": oldMetadata.collected_by ?? 'TDEI Workspaces',
		"collection_date": new Date().toISOString(),
		"collection_method": oldMetadata.collection_method ?? 'manual',
		"data_source": oldMetadata.data_source ?? '3rdParty',
		"schema_version": workspace.type === 'osw' ? 'v0.2' : 'v1.0',
		"dataset_area": oldMetadata.dataset_area
	};

  const jobId = await exporter.upload(workspace, metadata);

  if (jobId) {
    // TODO: show a more helpful message
    toast.info(`TDEI import job ${jobId} created sucessfully.`);
    navigateTo('/dashboard');
  }
}
</script>
