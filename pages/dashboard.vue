<template>
  <app-page class="dashboard-page">
    <div class="d-flex">
        <h2 class="visually-hidden">My Workspaces</h2>

        <label for="ws_project_group_picker">Project Group</label>
        <project-group-picker v-model="currentProjectGroup" id="ws_project_group_picker" />

        <nuxt-link class="btn btn-primary flex-shrink-0" to="/workspace/create">
          <app-icon variant="add" size="24" />
          New<span class="d-none d-sm-inline"> Workspace</span>
        </nuxt-link>
    </div>

    <div v-if="!currentWorkspaces" class="alert alert-info mt-4">
      <app-icon variant="info" />
      No workspaces exist in the selected project group.
    </div>
    <div v-else class="row mt-4 position-relative">
      <div class="col-md mb-3">
        <ul class="list-group">
          <li
            v-for="w in currentWorkspaces"
            :key="w.id"
            :class="getWorkspaceClasses(w)"
            @click="selectWorkspace(w)"
          >
            <div class="fw-bold">{{ w.title }}</div>
            <span class="badge bg-secondary"><app-icon variant="insert_drive_file" />{{ w.type }}</span>
            <span v-if="w.externalAppAccess > 0" class="badge bg-success ms-2">
              <app-icon v-if="w.externalAppAccess === 1" variant="public" />
              <app-icon v-else variant="lock" />
              App
            </span>
          </li>
        </ul>
      </div><!-- .col-md -->

      <div class="col-md workspace-details-col">
        <div class="card" :style="currentId ? '' : 'visibility: hidden'">
          <nav class="card-header">
            <div class="btn-toolbar">
              <nuxt-link class="btn btn-dark" :to="currentEditRoute">
                <app-icon variant="edit_location_alt" size="24" />
                Edit
              </nuxt-link>
              <div class="btn-group">
                <a :href="currentTasksHref" class="btn" target="_blank">
                  <app-icon variant="checklist" size="24" />
                  <span class="d-none d-sm-inline">Tasks</span>
                </a>
                <nuxt-link class="btn" :to="currentExportRoute" :aria-disabled="!currentWorkspacePolygon">
                  <app-icon variant="drive_folder_upload" size="24" />
                  <span class="d-none d-sm-inline">Export</span>
                </nuxt-link>
              </div>
              <div class="btn-group ms-auto">
                <nuxt-link class="btn" :to="currentSettingsRoute">
                  <app-icon variant="settings" size="24" />
                  <span class="d-none d-sm-inline">Settings</span>
                </nuxt-link>
              </div>
            </div>
          </nav>

          <div class="map-container">
            <div v-show="currentWorkspacePolygon" id="map" />
            <div v-show="!currentWorkspacePolygon" class="missing-workspace-area-notice">
              <loading-spinner v-if="loadingBbox.active" />
              <template v-else>
                <app-icon variant="info" size="48" />
                <div>This workspace is empty.</div>
              </template>
            </div>
          </div>

          <div class="table-responsive border-top">
            <table class="table table-striped mb-0">
              <tbody>
                <tr>
                  <th><app-icon variant="schedule" />Created At</th>
                  <td>{{ currentWorkspace.createdAt?.toLocaleString() }}</td>
                </tr>
                <tr>
                  <th><app-icon variant="person_outline" />Created By</th>
                  <td>{{ currentWorkspace.createdByName }}</td>
                </tr>
                <tr>
                  <th><app-icon variant="phonelink_setup" />App Access</th>
                  <td>
                    <span v-if="currentWorkspace.externalAppAccess === 0" class="badge bg-secondary text-uppercase">
                      Disabled
                    </span>
                    <span v-if="currentWorkspace.externalAppAccess === 1" class="badge bg-success text-uppercase">
                      Public
                    </span>
                    <span v-if="currentWorkspace.externalAppAccess === 2" class="badge bg-success text-uppercase">
                      Project Group Only
                    </span>
                  </td>
                </tr>
                <tr>
                  <th><app-icon variant="dataset" />From TDEI Dataset ID</th>
                  <td>{{ currentWorkspace.tdeiRecordId ?? 'N/A' }}</td>
                </tr>
                <tr>
                  <th><app-icon variant="group_work" />TDEI Project Group ID</th>
                  <td>{{ currentWorkspace.tdeiProjectGroupId }}</td>
                </tr>
              </tbody>
            </table>
          </div><!-- .table-responsive -->
        </div><!-- .card -->
      </div><!-- .col-md -->
    </div><!-- .row -->
  </app-page>
</template>

<script lang="ts">
let lastProjectGroupId;
let lastWorkspaceId;
</script>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading'
import { workspacesClient, osmClient, tdeiUserClient } from '~/services/index';
import { compareWorkspaceCreatedAtDesc } from '~/services/workspaces';

const route = useRoute();
const loadingBbox = reactive(new LoadingContext())
const map = ref(null);

const currentWorkspace = ref({});
const currentWorkspacePolygon = ref(null);
const currentId = computed(() => currentWorkspace.value.id);
const currentEditRoute = ref('');
const currentTasksHref = ref('https://workspaces-tasks.sidewalks.washington.edu/projects/1');
const currentExportRoute = computed(() => `/workspace/${currentId.value}/export`);
const currentSettingsRoute = computed(() => `/workspace/${currentId.value}/settings`);

const workspaces = (await workspacesClient.getMyWorkspaces()).sort(compareWorkspaceCreatedAtDesc);
const workspacesByProjectGroup = Map.groupBy(workspaces, w => w.tdeiProjectGroupId);

const currentProjectGroup = ref(null);
const currentWorkspaces = computed(() => workspacesByProjectGroup.get(currentProjectGroup.value));

for (const w of workspaces) {
  if (w.tdeiMetadata?.length > 0) {
    w.tdeiMetadata = JSON.parse(w.tdeiMetadata);
  }

  if (!w.type?.length) {
    w.type = w.tdeiMetadata?.data_type // TODO: temporary fallback
  }
}

onMounted(() => {
  watch(currentId, (val) => { lastWorkspaceId = val });
  watch(currentProjectGroup, (val) => { lastProjectGroupId = val });
  watch(currentWorkspaces, onCurrentWorkspacesChange);
  watch(currentId, (val) => {
    if (!val) {
      map.value = null;
    }
  });

  autoSelectPreferredView();
  onCurrentWorkspacesChange(currentWorkspaces.value);
});

function autoSelectPreferredView() {
  if (route.query.workspace) {
    const workspaceId = Number(route.query.workspace);
    const workspace = workspaces.find(w => w.id === workspaceId);

    if (workspace) {
      selectWorkspace(workspace);
      currentProjectGroup.value = workspace.tdeiProjectGroupId;
      return;
    }
  }

  if (lastWorkspaceId) {
    const workspace = workspaces.find(w => w.id === lastWorkspaceId);

    if (workspace) {
      selectWorkspace(workspace);
      currentProjectGroup.value = workspace.tdeiProjectGroupId;
      return;
    }
  }

  if (lastProjectGroupId) {
    currentProjectGroup.value = lastProjectGroupId;
  }
}

async function onCurrentWorkspacesChange(val) {
  if (val?.length > 0) {
    if (val[0].tdeiProjectGroupId !== currentWorkspace.value.tdeiProjectGroupId) {
      await selectWorkspace(val[0]);
    }
  } else {
    currentWorkspace.value = {};
  }
}

function getWorkspaceClasses(workspace) {
  return {
    'list-group-item': true,
    'list-group-item-action': true,
    'active': workspace.id === currentWorkspace.value.id
  };
}

async function selectWorkspace(workspace) {
  currentWorkspace.value = workspace;
  currentEditRoute.value = {
    path: `workspace/${currentId.value}/edit`,
    query: { datatype: workspace.type },
  };

  await updateMapPreview(workspace);
}

async function updateMapPreview(workspace) {
  await setCurrentWorkspacePolygon(workspace);

  if (!currentWorkspacePolygon.value) {
    return
  }

  await nextTick();

  if (!map.value) {
    initMap();
  }

  currentWorkspacePolygon.value.addTo(map.value)

  const bounds = currentWorkspacePolygon.value.getBounds();
  map.value.fitBounds(bounds);

  const zoom = map.value.getBoundsZoom(bounds);
  const center = bounds.getCenter();
  currentEditRoute.value.hash = `#map=${zoom}/${center.lat}/${center.lng}`;
}

function initMap() {
  // TODO: use Mapbox
  map.value = L.map('map');

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map.value);
}

async function setCurrentWorkspacePolygon(workspace) {
  if (currentWorkspacePolygon.value) {
    currentWorkspacePolygon.value.remove();
    currentWorkspacePolygon.value = null
  }

  const metadataArea = workspace.tdeiMetadata?.metadata?.dataset_detail?.dataset_area;

  if (metadataArea) {
    currentWorkspacePolygon.value = L.geoJSON(metadataArea);
    return;
  }

  await loadingBbox.cancelable(workspacesClient, async (client) => {
    const bbox = await client.getWorkspaceBbox(workspace.id);

    if (bbox) {
      currentWorkspacePolygon.value = L.rectangle([
        [bbox.min_lat, bbox.min_lon],
        [bbox.max_lat, bbox.max_lon]
      ])
    }
  });
}
</script>

<style lang="scss">
@import "assets/scss/theme.scss";

.dashboard-page {
  .map-container {
    height: 350px;
    background-color: $gray-200;
  }

  #map {
    width: 100%;
    height: 100%;
  }

  .missing-workspace-area-notice {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: $gray-600;
    text-align: center;
  }

  label[for=ws_project_group_picker] {
    flex-shrink: 0;
    align-self: center;
    font-size: $h5-font-size;
    margin-right: 1rem;

    @include media-breakpoint-down(md) {
      & {
        display: none;
      }
    }
  }

  .project-group-picker {
    width: auto;
    border-color: transparent;
    border-left-color: $border-color;
    margin-right: auto;

    &:hover {
      border-color: $border-color;
    }

    @include media-breakpoint-down(md) {
      & {
        width: 100%;
        border-color: $border-color;
        margin-right: 1rem;
      }
    }
  }

  .list-group-item {
    cursor: pointer;

    &.active {
      position: sticky;
      top: 1rem;
      bottom: 1rem;
    }

    .badge {
      text-transform: uppercase;
    }
  }

  .workspace-details-col {
    position: sticky;
    top: 1rem;
    margin-bottom: auto;
  }

  table th {
    white-space: nowrap;
  }
}
</style>
