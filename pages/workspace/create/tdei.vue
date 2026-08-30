// Test outline
// @test e2e: submitting the form with valid values confirms that workspace creation was initiated and links to the dashboard
// @test e2e: submitting the form with an API error shows an error message
// @test e2e: if an API error occurs when creating a workspace from either form, an error message is shown

<template>
  <app-page class="create-tdei-page">
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

    <workspace-creation-modal
      ref="creationInitiatedModal"
      :workspace-id="createdWorkspaceId"
    />

    <template v-if="loading.active">
      <app-spinner />
    </template>

    <div
      v-else
      class="row create-workspace-card-container"
    >
      <div class="col-md">
        <div class="card create-workspace-card">
          <div class="creat-workspace-card-header">
            <h1 class="create-workspace-card-title">Create a Workspace from TDEI</h1>
            <p class="create-workspace-card-desc">Create a workspace by importing an asset stored in the TDEI.</p>
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
              class="d-block mb-3 input-label"
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
            <button
              class="btn btn-link create-workspace-cancel-btn"
              type="button"
              @click="handleCancel"
            >
              Cancel
            </button>
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

        
      </div><!-- .col -->

      <div class="col-md d-flex flex-column">
        <div class="card mb-3 create-workspace-card">
          <div class="card-body p-2">
            <div id="dataset_map" />
          </div>
        </div><!-- .card -->
        <div class="card create-workspace-card">
          <div class="card-body">
            <h2>Workspace Information</h2>

            <div class="workspace-grid">

              <div class="info-item">
                <div class="label">Name</div>
                <div class="value">{{ record.metadata?.dataset_detail?.name }}</div>
              </div>

              <div class="info-item">
                <div class="label">Description</div>
                <div class="value">{{ record.metadata?.dataset_detail?.description }}</div>
              </div>

              <div class="info-item">
                <div class="label">Dataset Type</div>
                <div class="value">{{ record.data_type }}</div>
              </div>

              <div class="info-item">
                <div class="label">Status</div>
                <div class="value">{{ record.status }}</div>
              </div>

              <div class="info-item">
                <div class="label">TDEI Dataset ID</div>
                <div class="value">{{ record.tdei_dataset_id }}</div>
              </div>

              <div class="info-item">
                <div class="label">TDEI Project Group</div>
                <div class="value">{{ record.project_group?.name }}</div>
              </div>

              <div class="info-item">
                <div class="label">TDEI Service</div>
                <div class="value">{{ record.service?.name }}</div>
              </div>

              <div class="info-item">
                <div class="label">Collected By</div>
                <div class="value">{{ record.metadata?.dataset_detail?.collected_by }}</div>
              </div>

              <div class="info-item">
                <div class="label">Collection Date</div>
                <div class="value">{{ record.metadata?.dataset_detail?.collection_date }}</div>
              </div>

              <div class="info-item">
                <div class="label">Publication Date</div>
                <div class="value">{{ record.metadata?.dataset_detail?.publication_date }}</div>
              </div>

              <div class="info-item">
                <div class="label">OSW Schema Version</div>
                <div class="value">{{ record.metadata?.dataset_detail?.schema_version }}</div>
              </div>

            </div>
          </div><!-- .card-body -->
        </div><!-- .card -->
      </div><!-- .col -->
    </div><!-- .row -->
  </app-page>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading'
import { TdeiImporter, TdeiImporterContext } from '~/services/import/tdei';
import { tdeiClient, workspacesClient } from '~/services/index';
import type { WorkspaceCreationModal } from '#components';
import type { TdeiDatasetSummary } from '~/types/tdei';
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
const createdWorkspaceId = ref<number | undefined>();
const creationInitiatedModal = useTemplateRef<ComponentExposed<typeof WorkspaceCreationModal>>('creationInitiatedModal');

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

async function handleCancel() {
  await navigateTo('/dashboard');
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

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";
#dataset_map {
  height: 100%;
  border-radius: 8px;
}

.create-tdei-page {
  height: 100%;
  background-color: #F5F5F5;
  max-width: 100%;
  position: relative;
  padding: 0 3rem;
}
.create-workspace-card-container {
  height: 100%;
  padding-top: 50px;
}
.create-workspace-card {
  width: 100%;
  margin: 0 auto;
  border-radius: 10px;
  overflow: auto;
  .input-label {
    font-weight: 500;
    margin-bottom: 8px;
    color: $text-navy;
  }
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
  left: 2rem;
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

.card-body h2 {
  margin: 0 0 20px;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
  color: $text-secondary;
}

.workspace-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  column-gap: 20px;
  row-gap: 20px;
}

.info-item {
  min-width: 0;
}

.info-item .label {
  margin-bottom: 8px;
  color: $text-navy;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}

.info-item .value {
  color: $text-secondary;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.25;
  overflow-wrap: break-word;
}

@media (max-width: 800px) {
  .workspace-grid {
    grid-template-columns: 1fr 1fr;
    column-gap: 30px;
  }
}

@media (max-width: 600px) {
  .workspace-grid {
    grid-template-columns: 1fr;
    row-gap: 24px;
  }
}

</style>
