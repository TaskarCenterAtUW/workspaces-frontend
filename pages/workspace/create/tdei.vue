<template>
  <app-page class="create-tdei-page container">
    <h1 class="mb-4 h2">Create a Workspace from the TDEI</h1>

    <template v-if="loading.active">
      <app-spinner />
    </template>

    <div v-show="!loading.active" class="row">
      <div class="col-md-6 d-flex flex-column">
        <div class="card mb-3">
          <div class="card-body">
            <div class="mb-3">
              <label class="d-block">
                Workspace Title
                <input v-model.trim="workspaceTitle" class="form-control" />
              </label>
            </div>

            <button class="btn btn-primary" @click="create">
              <app-spinner v-if="creating.active" size="sm" />
              <template v-else>Create Workspace</template>
            </button>
          </div><!-- .card-body -->
        </div><!-- .card -->

        <div class="card">
          <div class="card-body">
            <table class="table table-striped">
              <tbody>
                <tr>
                  <th>Name</th>
                  <td>{{ dataset.name }}</td>
                </tr>
                <tr>
                  <th>Description</th>
                  <td>{{ dataset.description }}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td>{{ dataset.status }}</td>
                </tr>
                <tr>
                  <th>TDEI Dataset ID</th>
                  <td>{{ dataset.tdei_record_id }}</td>
                </tr>
                <tr>
                  <th>TDEI Project Group ID</th>
                  <td>{{ dataset.tdei_project_group_id }}</td>
                </tr>
                <tr>
                  <th>TDEI Service ID</th>
                  <td>{{ dataset.tdei_service_id }}</td>
                </tr>
                <tr>
                  <th>Collected By</th>
                  <td>{{ dataset.collected_by }}</td>
                </tr>
                <tr>
                  <th>Collection Date</th>
                  <td>{{ dataset.collection_date }}</td>
                </tr>
                <tr>
                  <th>Publication Date</th>
                  <td>{{ dataset.publication_date }}</td>
                </tr>
                <tr>
                  <th>OSW Schema Version</th>
                  <td>{{ dataset.osw_schema_version }}</td>
                </tr>
              </tbody>
            </table>
          </div><!-- .card-body -->
        </div><!-- .card -->
      </div><!-- .col -->

      <div class="col-md-6">
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
import { tdeiClient, workspacesClient } from '~/services/index'

const loading = reactive(new LoadingContext());
const creating = reactive(new LoadingContext());
const route = useRoute();
const tdeiRecordId = route.query.tdeiRecordId;
const datasetRequested = tdeiRecordId?.length ?? false;
const dataset = reactive({});
const map = ref({});
const workspaceTitle = ref('');

async function getDatasetInfo(route, params) {
  await loading.wrap(tdeiClient, async (client) => {
    const info = await client.getDatasetInfo(tdeiRecordId);

    if (!info) {
      return;
    }

    for (const prop in info) {
      dataset[prop] = info[prop];
    }

    workspaceTitle.value = dataset.name;
  })
}

onMounted(async () => {
  if (datasetRequested) {
    await getDatasetInfo(route);
    await nextTick();
    initMap();
  }
})

function initMap() {
  // TODO: use Mapbox
  map.value = L.map('dataset_map');

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map.value);

  const area = L.geoJSON(dataset.dataset_area).addTo(map.value);
  const bounds = area.getBounds();

  map.value.fitBounds(bounds);
}

async function create() {
  await creating.wrap(workspacesClient, async (client) => {
    await client.createWorkspace({
      title: workspaceTitle.value,
      tdeiRecordId: dataset.tdei_record_id
    });
  });

  navigateTo('/dashboard');
}
</script>

<style lang="scss">
#dataset_map {
  height: 100%;
}
</style>
