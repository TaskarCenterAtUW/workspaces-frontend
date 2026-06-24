// Test outline
// @test e2e: this page shows a Dataset Name that is editable, and asks the user to choose a project group and service returned from the TDEI API,
//            as well as dataset version box (playwright snapshot this)
// @test e2e: if the user doesn't have permissions to export to the TDEI, a message is shown indicating that and the project group and service
//             pickers are not shown (playwright snapshot this)
// @test e2e: submitting the form with valid values shows a loading state
// @test e2e: the service names and project groups shown should match the simulated TDEI API response.
// @test e2e: submitting the form with a dataset version that already exists in the TDEI for that service shows an error message, and allows the
//            user to change the version and try again (playwright snapshot this)
// @test e2e: submitting the form with an API error shows an error message and a "try again" button, and clicking the "try again" button resets
//            the form (playwright snapshot the error state)
// @test e2e: if the user leaves any field blank and tries to submit, an error message is shown indicating that all fields are required (playwright
//            snapshot this)
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
// @test e2e: ensure that the service selector and project group selector display something meaningful even when there are no services or project groups to display to the user, e.g. "No services available" or "No project groups available" (playwright snapshot this)
<template>
  <app-page>
    <div class="text-center mt-5">
      <app-icon
        variant="drive_folder_upload"
        size="48"
      />
    </div>
    <h1 class="mb-5 text-center">
      Export Workspace to the TDEI
    </h1>

    <div class="row row-cols-1 row-cols-md-2 g-4">
      <div class="col mx-auto">
        <div
          v-if="!canExport"
          class="card"
        >
          <div class="card-body">
            <p>
              You don't have permission to export this workspace to the TDEI.
              Exporting requires a <strong>POC</strong> or
              <strong>{{ dataGeneratorRole }}</strong> role
              in at least one TDEI project group.
            </p>
            <p class="mb-0">
              Contact your TDEI project group POC to request the appropriate role.
            </p>
          </div>
          <div class="card-footer">
            <nuxt-link
              to="../export"
              class="btn btn-primary"
            >
              <app-icon
                variant="arrow_circle_left"
                no-margin
              />
              Go back
            </nuxt-link>
          </div>
        </div>

        <div
          v-else-if="workspace.type === 'pathways' && !workspace.tdeiRecordId"
          class="card"
        >
          <div class="card-body">
            <p>
              This GTFS Pathways workspace is not derived from a TDEI dataset and
              lacks information needed to pass TDEI validaion.
            </p>
          </div>
          <div class="card-footer">
            <nuxt-link
              to="../export"
              class="btn btn-primary"
            >
              <app-icon
                variant="arrow_circle_left"
                no-margin
              />
              Go back
            </nuxt-link>
          </div>
        </div>

        <form
          v-else
          class="card"
        >
          <fieldset
            class="card-body"
            :disabled="context.active || context.error"
          >
            <label class="d-block">
              Dataset Name
              <input
                v-model.trim="datasetName"
                class="form-control"
              >
            </label>
            <div class="mt-3">
              <label
                class="d-block"
                for="export_tdei_project_group"
              >
                Project Group
              </label>
              <project-group-picker
                id="export_tdei_project_group"
                v-model="workspace.tdeiProjectGroupId"
                :options="eligibleProjectGroups"
              />
            </div>
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
              <input
                v-model.trim="datasetVersion"
                class="form-control"
              >
            </label>
          </fieldset>
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
              :disabled="context.active"
              @click.prevent="upload"
            >
              Upload
              <app-icon
                variant="arrow_circle_right"
                no-margin
              />
            </button>
          </div><!-- .card-footer -->
        </form><!-- .card -->
      </div><!-- .col -->
    </div><!-- .row -->
  </app-page>
</template>

<script setup lang="ts">
import { osmClient, tdeiClient, tdeiUserClient, workspacesClient } from '~/services/index';
import { TdeiExporter, TdeiExporterContext } from '~/services/export/tdei'
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

const context = reactive(new TdeiExporterContext());
const exporter = new TdeiExporter(tdeiClient, osmClient, context);

const route = useRoute();
const workspaceId = Number(route.params.id);

const [workspaceData, { items: myProjectGroups }] = await Promise.all([
  workspacesClient.getWorkspace(workspaceId),
  tdeiUserClient.getMyProjectGroups(1, '', 10000),
]);

const workspace = reactive(workspaceData);

const dataGeneratorRole = `${workspace.type}_data_generator`;
const eligibleProjectGroups = myProjectGroups.filter(pg =>
  pg.roles.includes('poc') || pg.roles.includes(dataGeneratorRole),
);
const canExport = eligibleProjectGroups.length > 0;

// Default to the workspace's own PG if eligible, otherwise first eligible PG:
if (canExport && !eligibleProjectGroups.some(pg => pg.tdei_project_group_id === workspace.tdeiProjectGroupId)) {
  workspace.tdeiProjectGroupId = eligibleProjectGroups[0]!.tdei_project_group_id;
}

const oldMetadata = workspace.tdeiMetadata ? JSON.parse(workspace.tdeiMetadata) : {};

const datasetName = ref(workspace.title);
const datasetVersion = ref(oldMetadata.metadata?.dataset_detail?.version);

async function upload() {
  // TODO: enable metadata customization
  const metadata = {
    name: datasetName.value,
    version: datasetVersion.value,
    description: oldMetadata.description ?? '',
    collected_by: oldMetadata.collected_by ?? 'TDEI Workspaces',
    collection_date: new Date().toISOString(),
    collection_method: oldMetadata.collection_method ?? 'manual',
    data_source: oldMetadata.data_source ?? '3rdParty',
    schema_version: workspace.type === 'osw' ? 'v0.3' : 'v1.0',
    dataset_area: oldMetadata.dataset_area
  };

  const jobId = await exporter.upload(workspace, metadata);

  if (jobId) {
    // TODO: show a more helpful message
    toast.info(`TDEI import job ${jobId} created successfully.`);
    navigateTo('/dashboard');
  }
}
</script>
