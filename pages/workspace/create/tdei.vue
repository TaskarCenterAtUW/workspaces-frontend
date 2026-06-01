<template>
  <app-page class="create-tdei-page">
    <h1 class="mb-4 h2">Create a Workspace from the TDEI</h1>

    <template v-if="loading.active">
      <app-spinner />
    </template>

    <div v-else class="row">
      <div class="col-md d-flex flex-column">
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

            <div class="mb-3">
              <label class="d-block" for="create_tdei_project_group">
                Project Group
              </label>
              <project-group-picker
                id="create_tdei_project_group"
                v-model="projectGroupId"
                :disabled="context.active"
                required
              />
            </div>

            <label v-if="!$route.query.tdeiRecordId" class="d-block mb-3">
              Dataset
              <dataset-picker
                v-model="tdeiRecordId"
                :project-group-id="projectGroupId ?? ''"
                :disabled="context.active"
                required
              />
            </label>
            <div v-if="datasetError" class="alert alert-danger py-2" role="alert">
              {{ datasetError }}
            </div>
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
declare const L: any;
import { LoadingContext } from '~/services/loading'
import { TdeiImporter, TdeiImporterContext } from '~/services/import/tdei';
import { osmClient, tdeiClient, workspacesClient } from '~/services/index';

const context = reactive(new TdeiImporterContext());
const importer = new TdeiImporter(workspacesClient, tdeiClient, osmClient, context);

const loading = reactive(new LoadingContext());
const route = useRoute();
const tdeiRecordId = ref<string | null>(null);
const record = reactive<Record<string, any>>({});
const map = ref<any>({});
const workspaceTitle = ref('');
const projectGroupId = ref<string | null>(null);
const datasetError = ref<string | null>(null);

watch(tdeiRecordId, (val) => getDatasetInfo(val));

const complete = computed(() =>
  workspaceTitle.value.trim().length > 0
  && projectGroupId.value !== null
  && tdeiRecordId.value !== null
  && datasetError.value === null,
);

async function getDatasetInfo(id: string | null) {
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

    if (!info) return

    // Clear stale keys from any previously loaded dataset before merging,
    // so switching datasets never leaves orphaned fields in record.
    for (const key of Object.keys(record)) {
      delete record[key]
    }

    Object.assign(record, info)
  });

  await nextTick();

  if (!record.project_group?.tdei_project_group_id || !record.tdei_dataset_id) {
    datasetError.value = 'The selected dataset returned incomplete data. Please try a different dataset or contact support.'
    return
  }

  workspaceTitle.value = record.metadata?.dataset_detail?.name ?? ''
  projectGroupId.value = record.project_group.tdei_project_group_id
  tdeiRecordId.value = record.tdei_dataset_id

  initMap();
}

onMounted(async () => {
  tdeiRecordId.value = route.query.tdeiRecordId?.toString() || null;
})

function initMap() {
  if (map.value && map.value.remove) {
    map.value.remove()
  }

  // TODO: use Mapbox
  map.value = L.map('dataset_map');

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map.value);

  if (record.metadata?.dataset_detail?.dataset_area) {
    const area = L.geoJSON(record.metadata.dataset_detail.dataset_area).addTo(map.value)
    const bounds = area.getBounds()

    if (bounds.isValid()) {
      map.value.fitBounds(bounds)
    }
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

  if (workspaceId) {
    navigateTo('/dashboard?workspace=' + workspaceId);
  }
}
</script>

<style lang="scss">
#dataset_map {
  height: 100%;
}
</style>
