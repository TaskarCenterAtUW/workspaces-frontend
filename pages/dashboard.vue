<template>
  <app-page class="dashboard-page">
    <div class="row">
      <div class="col">
        <h2>My Workspaces</h2>
      </div>
      <div class="col text-end">
        <nuxt-link class="btn btn-primary" to="/workspace/create">
          <app-icon variant="add" size="24" />
          New<span class="d-none d-sm-inline"> Workspace</span>
        </nuxt-link>
      </div>
    </div>

    <div class="row mt-4">
      <div class="col-md-6 mb-3">
        <ul class="list-group">
          <li
            v-for="w in workspaces"
            :key="w.workspaceId"
            :class="getWorkspaceClasses(w)"
            @click="selectWorkspace(w)"
          >
            <div class="fw-bold">{{ w.title }}</div>
            <div>Project Group: {{ w.projectGroupId }}</div>
          </li>
        </ul>
      </div><!-- .col -->

      <div class="col-md-6" :style="currentId ? '' : 'visibility: hidden'">
        <div class="card">
          <nav class="card-header">
            <div class="btn-toolbar">
              <div class="btn-group">
                <a :href="currentEditHref" class="btn btn-dark" target="_blank">
                  <app-icon variant="edit_location_alt" size="24" />
                  Edit
                </a>
                <a :href="currentTasksHref" class="btn" target="_blank">
                  <app-icon variant="checklist" size="24" />
                  Tasks
                </a>
                <nuxt-link class="btn" :to="currentExportRoute">
                  <app-icon variant="drive_folder_upload" size="24" />
                  Export
                </nuxt-link>
              </div>
              <div class="btn-group ms-auto">
                <nuxt-link class="btn" :to="currentSettingsRoute">
                  <app-icon variant="settings" size="24" />
                  Settings
                </nuxt-link>
              </div>
            </div>
          </nav>

          <div id="map" />

          <div class="card-body border-top">
          </div><!-- .card-body -->

          <table class="table table-striped border-top">
            <tbody>
              <tr>
                <th>Created At</th>
                <td>{{ currentWorkspace.createdAt }}</td>
              </tr>
              <tr>
                <th>From TDEI Dataset ID</th>
                <td>{{ currentWorkspace.tdeiRecordId }}</td>
              </tr>
              <tr>
                <th>TDEI Project Group ID</th>
                <td>{{ currentWorkspace.projectGroupId }}</td>
              </tr>
            </tbody>
          </table>
        </div><!-- .card -->
      </div><!-- .col -->
    </div>

    <!--<p>No active workspaces available.</p>-->

  </app-page>
</template>

<script setup lang="ts">
import { workspacesClient } from '~/services/index'

const currentWorkspace = ref({})
const currentId = computed(() => currentWorkspace.value.workspaceId)
const currentEditHref = ref('')
const currentTasksHref = ref('https://workspaces-tasks.sidewalks.washington.edu/projects/1')
const currentExportRoute = computed(() => `/workspace/${currentId.value}/export`)
const currentSettingsRoute = computed(() => `/workspace/${currentId.value}/settings`)
const map = ref({})
const workspaces = await workspacesClient.getMyWorkspaces();
let lastPolygon;

onMounted(async () => {
  // TODO: use Mapbox
  map.value = L.map('map');

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map.value);
});

function getWorkspaceClasses(w) {
  return {
    'list-group-item': true,
    'list-group-item-action': true,
    'active': w.workspaceId === currentWorkspace.value.workspaceId
  };
}

function selectWorkspace(workspace) {
  currentWorkspace.value = workspace;

  if (lastPolygon) {
    lastPolygon.remove();
  }

  lastPolygon = L.polygon(workspace.coordinates).addTo(map.value);

  const bounds = lastPolygon.getBounds();
  map.value.fitBounds(bounds);

  const zoom = map.value.getBoundsZoom(bounds);
  const center = bounds.getCenter()
  currentEditHref.value = `https://workspaces-osm.sidewalks.washington.edu/edit#map=${zoom}/${center.lat}/${center.lng}`
}
</script>

<style lang="scss">
.dashboard-page {
  #map {
    height: 350px;
  }
}
</style>
