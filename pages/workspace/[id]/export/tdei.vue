// Test outline
// @test e2e: this page shows a Dataset Name that is editable, and asks the user to choose a project group and service returned from the TDEI API,
//            as well as dataset version box (playwright snapshot this)
// @test e2e: if the user doesn't have permissions to export to the TDEI, a message is shown indicating that and the project group and service
//             pickers are not shown (playwright snapshot this)
// @test e2e: all fields are required. Empty values should not be allowed, and the form should not be submittable with no values provided. Version should also only accept numbers.
// @test e2e: submitting the form with valid values shows a loading state, an error is shown for any invalid values or the form is not submittable and the issue flagged to the user
// @test e2e: the service names and project groups shown should match the simulated TDEI API response.
// @test e2e: submitting the form with a dataset version that already exists in the TDEI for that service shows an error message, and allows the
//            user to change the version and try again (playwright snapshot this)
// @test e2e: submitting the form with an API error shows an error message
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
// @test e2e: ensure that the service selector and project group selector display something meaningful even when there are no services or project groups to display to
//            the user, e.g. "No services available" or "No project groups available" (playwright snapshot this)
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
            :disabled="context.active || !!context.error"
          >
            <label class="d-block">
              Dataset Name
              <input
                v-model.trim="datasetName"
                class="form-control"
                required
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
                required
              />
            </div>
            <label class="d-block mt-3">
              Service
              <service-picker
                v-model="workspace.tdeiServiceId"
                :project-group-id="workspace.tdeiProjectGroupId"
                :service-type="workspace.type"
                required
              />
            </label>
            <label class="d-block mt-3">
              Dataset Version
              <input
                v-model.trim="datasetVersion"
                class="form-control"
                required
              >
            </label>
            <div class="form-check form-switch mt-3">
              <label class="form-check-label">
                <input
                  v-model="includeChangesets"
                  type="checkbox"
                  class="form-check-input"
                >
                Export change history
              </label>
            </div>
            <div class="form-text mt-1">
              Attaches a <code>changeset.zip</code> to the export which
              contains a <code>manifest.json</code> summary metadata file
              and a <code>changesets/</code> directory with one
              <code>{id}.json</code> file per change history entry.
              <p class="mb-0 mt-1">Required to certify the export for ADA compliance.</p>
            </div>
            <div
              v-if="includeChangesets"
              class="mt-3"
            >
              <div class="form-check form-switch">
                <label class="form-check-label">
                  <input
                    v-model="includeRawOsc"
                    type="checkbox"
                    class="form-check-input"
                  >
                  Include raw osmChange XML files
                </label>
              </div>
              <div class="form-text mt-1">
                Adds an <code>{id}.osc</code> file alongside each
                <code>{id}.json</code> containing unprocessed
                <a
                  href="https://wiki.openstreetmap.org/wiki/OsmChange"
                  target="_blank"
                >osmChange XML</a>
                for use with third-party OpenStreetMap tools.
              </div>
              <div class="form-check form-switch mt-3">
                <label class="form-check-label">
                  <input
                    v-model="includeAdaCertification"
                    type="checkbox"
                    class="form-check-input"
                  >
                  Certify for ADA compliance
                </label>
              </div>
              <div class="form-text mt-1">
                Adds an attestation to the changeset manifest confirming that
                this dataset's measurements accurately reflect field conditions
                and were collected according to your agency's methodology. Your
                agency determines the specific criteria. This is a data
                integrity sign-off, not a separate legal credential.
              </div>
              <div
                v-if="includeAdaCertification"
                class="mt-3 border rounded p-3 bg-light small"
              >
                <dl class="row mb-0">
                  <dt class="col-sm-4 text-muted">Certified by</dt>
                  <dd class="col-sm-8 mb-1">{{ certifiedByName }}</dd>
                  <dt class="col-sm-4 text-muted">Date</dt>
                  <dd class="col-sm-8 mb-0">{{ certifiedAt }}</dd>
                </dl>
              </div>
            </div>
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
import type { TdeiDatasetMetadataDatasetDetail } from '~/types/tdei';
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
const includeChangesets = ref(false);
const includeRawOsc = ref(false);
const includeAdaCertification = ref(false);
const certifiedByName = osmClient.auth.displayName ?? '';
const certifiedAt = new Date().toISOString().slice(0, 10);

async function upload() {
  const allFieldsProvided = String(datasetName.value ?? '').trim()
    && workspace.tdeiProjectGroupId
    && workspace.tdeiServiceId
    && String(datasetVersion.value ?? '').trim();

  if (!allFieldsProvided) {
    toast.error('All fields are required: Dataset Name, Project Group, Service, and Dataset Version.');
    return;
  }

  // TODO: enable metadata customization
  const metadata: TdeiDatasetMetadataDatasetDetail = {
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

  const jobId = await exporter.upload(workspace, metadata, {
    includeChangesets: includeChangesets.value,
    includeRawOsc: includeRawOsc.value,
    adaCertification: includeChangesets.value && includeAdaCertification.value
      ? {
          certifiedBy: osmClient.auth.subject,
          certifiedByName,
          certifiedAt,
        }
      : undefined,
  });

  if (jobId) {
    // TODO: show a more helpful message
    toast.info(`TDEI import job ${jobId} created successfully.`);
    navigateTo('/dashboard');
  }
}
</script>
