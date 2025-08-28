<template>
  <app-page>
    <div class="text-center mt-5">
      <app-icon variant="drive_folder_upload" size="48" />
    </div>
    <h1 class="mb-5 text-center">Export Workspace</h1>

    <div class="row row-cols-1 row-cols-md-2 g-4">
      <div class="col">
        <div class="card">
          <div class="card-body">
            <app-icon variant="cloud_upload" size="36" class="mb-2" />
            <h2 class="card-title h5">Upload to TDEI</h2>
            <p class="card-text">
              Export the workspaces as a new TDEI dataset.
            </p>
          </div>
          <div class="card-footer">
            <nuxt-link class="btn btn-primary" to="./export/tdei">
              <app-spinner v-if="exporting.active" size="sm" />
              <template v-else>
                Start
                <app-icon variant="arrow_circle_right" no-margin />
              </template>
            </nuxt-link>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="card">
          <div class="card-body">
            <app-icon variant="download_for_offline" size="36" class="mb-2" />
            <h2 class="card-title h5">Download</h2>
            <p class="card-text">
              Save the workspace data to your device.
            </p>
            <p><em>
              Note: press the "Start Preparing File for Download" button to prepare the download which may take a minute; when it's ready, the button will change to "Start", when you can then press again to download the file to your device.
            </em></p>
          </div>
          <div class="card-footer">
            <a
              v-if="downloadUrl"
              :href="downloadUrl"
              :download="downloadFilename"
              class="btn btn-success"
            >
              <app-icon variant="save_alt" no-margin />
              Save
            </a>
            <button v-else class="btn btn-primary" @click="download">
              <template v-if="downloading.active">
              <app-spinner size="sm" />&nbsp;Preparing Download...
              </template>
              <template v-else>
                Start Preparing File for Download
                <app-icon variant="arrow_circle_right" no-margin />
              </template>
            </button>
          </div>
        </div>
      </div>
    </div>
  </app-page>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading'
import { tdeiClient, workspacesClient } from '~/services/index'
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

const downloading = reactive(new LoadingContext());
const exporting = reactive(new LoadingContext());
const route = useRoute();
const workspaceId = route.params.id;
const workspace = await workspacesClient.getWorkspace(workspaceId);
const oldMetadata = workspace.tdeiMetadata ? JSON.parse(workspace.tdeiMetadata) : {};
const datasetName = ref(workspace.title);
const datasetVersion = ref(oldMetadata.version);
const downloadUrl = ref(null);
const downloadFilename = computed(() => `workspace-${workspaceId}-${workspace.type}-export.zip`);

async function exportTdei() {
  // TODO: enable metadata customization
	const metadata = {
		"name": datasetName.value,
		"version": datasetVersion.value,
		"description": oldMetadata.description ?? '',
		"collected_by": oldMetadata.collected_by ?? 'TDEI Workspaces',
		"collection_date": new Date().toISOString(),
		"collection_method": oldMetadata.collection_method ?? 'manual',
		"data_source": oldMetadata.data_source ?? '3rdParty',
		"schema_version": oldMetadata.schema_version ?? 'v1.0',
		"dataset_area": oldMetadata.dataset_area
	};

  exporting.wrap(workspacesClient, async (client) => {
    const jobId = await client.exportWorkspaceToTdei(workspace, metadata);
    alert(`TDEI import job ${jobId} created sucessfully.`);
    navigateTo('/dashboard');
  });
}

async function download() {
  try {
    downloading.wrap(workspacesClient, async (client) => {
      const zip = await workspacesClient.exportWorkspaceArchive(workspace);
      downloadUrl.value = URL.createObjectURL(zip);
      
      toast.info(`Download is ready. Click the "Save" button to save the file to your device.`);
    });
  } catch(e) {
    toast.error(`Error preparing download: ${e.message}`);
  }
}
</script>
