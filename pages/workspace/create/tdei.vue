// Test outline
// @test e2e: submitting the form with valid values confirms that workspace creation was initiated and links to the dashboard
// @test e2e: submitting the form with an API error shows an error message
// @test e2e: if an API error occurs when creating a workspace from either form, an error message is shown

<template>
  <app-page class="create-tdei-page">
    <h1 class="mb-4 h2">Create a Workspace from the TDEI</h1>

    <b-modal
      ref="creationInitiatedModal"
      title="Workspace creation initiated"
      centered
      no-header-close
      no-close-on-backdrop
      no-close-on-esc
    >
      <p>
        We’re setting up your workspace and loading your dataset. You can leave this page. It will
        show as <strong>Ready</strong> when setup is complete. Use the Refresh button on the
        dashboard to get the latest status.
      </p>

      <template #footer>
        <nuxt-link
          class="btn btn-primary"
          :to="`/dashboard?workspace=${createdWorkspaceId}`"
        >
          Go to Dashboard
        </nuxt-link>
      </template>
    </b-modal>

    <template v-if="loading.active">
      <app-spinner />
    </template>

    <div
      v-else
      class="row"
    >
      <div class="col-md d-flex flex-column">
        <div class="card mb-3">
          <div class="card-body">
            <label class="d-block mb-3">
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
                class="d-block"
                for="create_tdei_project_group"
              >
                Project Group
              </label>
              <project-group-picker
                id="create_tdei_project_group"
                v-model="projectGroupId"
                :disabled="context.active || createdWorkspaceId !== undefined"
                required
              />
            </div>

            <label
              v-if="!$route.query.tdeiRecordId"
              class="d-block mb-3"
            >
              Dataset
              <dataset-picker
                v-model="tdeiRecordId"
                :disabled="context.active || createdWorkspaceId !== undefined"
                :selected-dataset="selectedDataset"
                required
              />
            </label>
            <div
              v-if="datasetError"
              class="alert alert-danger py-2"
              role="alert"
            >
              {{ datasetError }}
            </div>
          </div><!-- .card-body -->

          <div class="card-footer">
            <section
              v-if="context.error"
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
              v-else
              type="submit"
              class="btn btn-primary"
              :disabled="!complete || context.active || createdWorkspaceId !== undefined"
              @click.prevent="create"
            >
              {{ createButtonLabel }}
            </button>
          </div><!-- .card-footer -->
        </div><!-- .card -->

        <div class="card">
          <div class="card-body">
            <table class="table table-striped">
              <tbody>
                <tr>
                  <th>Name</th>
                  <td>{{ record.metadata?.dataset_detail?.name }}</td>
                </tr>
                <tr>
                  <th>Description</th>
                  <td>{{ record.metadata?.dataset_detail?.description }}</td>
                </tr>
                <tr>
                  <th>Dataset Type</th>
                  <td>{{ record.data_type }}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td>{{ record.status }}</td>
                </tr>
                <tr>
                  <th>TDEI Dataset ID</th>
                  <td>{{ record.tdei_dataset_id }}</td>
                </tr>
                <tr>
                  <th>TDEI Project Group</th>
                  <td>{{ record.project_group?.name }}</td>
                </tr>
                <tr>
                  <th>TDEI Service</th>
                  <td>{{ record.service?.name }}</td>
                </tr>
                <tr>
                  <th>Collected By</th>
                  <td>{{ record.metadata?.dataset_detail?.collected_by }}</td>
                </tr>
                <tr>
                  <th>Collection Date</th>
                  <td>{{ record.metadata?.dataset_detail?.collection_date }}</td>
                </tr>
                <tr>
                  <th>Publication Date</th>
                  <td>{{ record.metadata?.dataset_detail?.publication_date }}</td>
                </tr>
                <tr>
                  <th>OSW Schema Version</th>
                  <td>{{ record.metadata?.dataset_detail?.schema_version }}</td>
                </tr>
              </tbody>
            </table>
          </div><!-- .card-body -->
        </div><!-- .card -->
      </div><!-- .col -->

      <div class="col-md">
        <div class="card">
          <div class="card-body">
            <div id="dataset_map" />
          </div>
        </div><!-- .card -->
      </div><!-- .col -->
    </div><!-- .row -->
  </app-page>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading'
import { TdeiImporter, TdeiImporterContext } from '~/services/import/tdei';
import { tdeiClient, workspacesClient } from '~/services/index';
import type { TdeiDatasetSummary } from '~/types/tdei';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import type { ComponentExposed } from 'vue-component-type-helpers';
import { createMaplibreMap } from '~/util/map-style';
import { getGeoJsonBounds } from '~/util/geojson';

const DATASET_AREA_SOURCE_ID = 'dataset-area';
const DATASET_AREA_COLOR = '#3388ff';

const context = reactive(new TdeiImporterContext());
const importer = new TdeiImporter(workspacesClient, context);

const loading = reactive(new LoadingContext());
const route = useRoute();
const tdeiRecordId = ref<string | null>(null);
const record = reactive<Record<string, any>>({});
let map: import('maplibre-gl').Map | null = null;
let mapInitId = 0;
const workspaceTitle = ref('');
const projectGroupId = ref<string | null>(null);
const datasetError = ref<string | null>(null);
const createdWorkspaceId = ref<number>();
const creationInitiatedModal = useTemplateRef<ComponentExposed<typeof BModal>>('creationInitiatedModal');

const selectedDataset = computed<TdeiDatasetSummary | undefined>(() => {
  const detail = record.metadata?.dataset_detail;
  if (!tdeiRecordId.value || !detail?.name) return undefined;

  return {
    id: tdeiRecordId.value,
    name: detail.name,
    version: detail.version,
    projectGroupName: record.project_group?.name
  };
});

watch(tdeiRecordId, val => getDatasetInfo(val));

const complete = computed(() =>
  workspaceTitle.value.trim().length > 0
  && projectGroupId.value != null
  && tdeiRecordId.value !== null
  && datasetError.value === null,
);
const createButtonLabel = computed(() => {
  if (createdWorkspaceId.value !== undefined) return 'Creation initiated';
  return context.active ? 'Initiating...' : 'Create Workspace';
});

let datasetInfoSequence = 0;
async function getDatasetInfo(id: string | null) {
  const requestId = ++datasetInfoSequence;
  datasetError.value = null

  if (id === null) {
    for (const prop in record) {
      record[prop] = '';
    }

    workspaceTitle.value = '';
    return;
  }

  await loading.wrap(tdeiClient, async (client) => {
    const info = await client.getDatasetInfo(id);
    if (requestId !== datasetInfoSequence) return;
    if (!info) return

    // Clear stale keys from any previously loaded dataset before merging,
    // so switching datasets never leaves orphaned fields in record.
    for (const key of Object.keys(record)) {
      Reflect.deleteProperty(record, key)
    }

    Object.assign(record, info)
  });

  await nextTick();

  if (requestId !== datasetInfoSequence) return;

  if (!record.project_group?.tdei_project_group_id || !record.tdei_dataset_id) {
    datasetError.value = 'The selected dataset returned incomplete data. Please try a different dataset or contact support.'
    return
  }

  workspaceTitle.value = record.metadata?.dataset_detail?.name ?? ''
  tdeiRecordId.value = record.tdei_dataset_id

  void initMap();
}

onMounted(async () => {
  tdeiRecordId.value = route.query.tdeiRecordId?.toString() || null;
})

async function initMap() {
  const initId = ++mapInitId

  if (map) {
    map.remove()
    map = null
  }

  const handle = await createMaplibreMap('dataset_map', { center: [0, 0], zoom: 0 })

  // A newer dataset selection already handled map creation while this one
  // was still loading the module.
  if (initId !== mapInitId) {
    handle.map.remove()
    return
  }

  map = handle.map

  const datasetArea = record.metadata?.dataset_detail?.dataset_area
  const bounds = datasetArea ? getGeoJsonBounds(datasetArea) : null

  await handle.ready

  if (initId !== mapInitId) {
    handle.map.remove()
    return
  }

  handle.map.addSource(DATASET_AREA_SOURCE_ID, {
    type: 'geojson',
    data: datasetArea ?? { type: 'FeatureCollection', features: [] },
  })
  handle.map.addLayer({
    id: `${DATASET_AREA_SOURCE_ID}-fill`,
    type: 'fill',
    source: DATASET_AREA_SOURCE_ID,
    paint: { 'fill-color': DATASET_AREA_COLOR, 'fill-opacity': 0.2 },
  })
  handle.map.addLayer({
    id: `${DATASET_AREA_SOURCE_ID}-line`,
    type: 'line',
    source: DATASET_AREA_SOURCE_ID,
    paint: { 'line-color': DATASET_AREA_COLOR, 'line-width': 3 },
  })

  if (bounds) {
    handle.map.fitBounds(bounds)
  }
}

async function create() {
  const workspaceId = await importer.import({
    title: workspaceTitle.value,
    type: record.data_type,
    tdeiRecordId: tdeiRecordId.value as string,
    tdeiProjectGroupId: projectGroupId.value as string,
    tdeiServiceId: record.service?.tdei_service_id || '',
    tdeiMetadata: JSON.stringify(record),
  });

  if (workspaceId !== undefined) {
    createdWorkspaceId.value = workspaceId;
    await nextTick();
    creationInitiatedModal.value?.show();
  }
}
</script>

<style lang="scss">
#dataset_map {
  height: 100%;
}
</style>
