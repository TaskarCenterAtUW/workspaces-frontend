<template>
  <div class="map-container">
    <div v-show="workspaceAreaPolygon" id="map" />
    <div v-show="!workspaceAreaPolygon" class="missing-workspace-area-notice">
      <loading-spinner v-if="loadingBbox.active" />
      <template v-else>
        <app-icon variant="info" size="48" />
        <div>This workspace is empty.</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading';
import { workspacesClient } from '~/services/index';

const props = defineProps({
  workspace: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['centerLoaded']);

const loadingBbox = reactive(new LoadingContext());
const map = ref(null);
const workspaceAreaPolygon = ref(null);

onMounted(() => {
  watch(
    () => props.workspace,
    (val) => {
      if (val) {
        updateMapPreview(val);
      } else {
        map.value = null;
      }
    },
    { immediate: true }
  );
});

function initMap() {
  // TODO: use Mapbox
  map.value = L.map('map');

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map.value);
}

async function updateMapPreview(workspace) {
  if (workspaceAreaPolygon.value) {
    workspaceAreaPolygon.value.remove();
    workspaceAreaPolygon.value = null
  }

  if (!props.workspace.id) {
    return;
  }

  await setCurrentWorkspacePolygon(workspace);

  if (!workspaceAreaPolygon.value) {
    return;
  }

  if (!map.value) {
    initMap();
  }

  const bounds = workspaceAreaPolygon.value.getBounds();

  workspaceAreaPolygon.value.addTo(map.value);
  map.value.fitBounds(bounds);

  const zoom = map.value.getBoundsZoom(bounds);
  const center = bounds.getCenter();

  emit('centerLoaded', { zoom, latitude: center.lat, longitude: center.lng });
}

async function setCurrentWorkspacePolygon(workspace) {
  const metadataArea = workspace.tdeiMetadata?.metadata?.dataset_detail?.dataset_area;

  if (metadataArea) {
    const polygon = L.geoJSON(metadataArea);

    if (polygon.getBounds().isValid()) {
      workspaceAreaPolygon.value = polygon;
      return;
    }
  }

  await loadingBbox.cancelable(workspacesClient, async (client) => {
    const bbox = await client.getWorkspaceBbox(workspace.id);

    if (bbox) {
      workspaceAreaPolygon.value = L.rectangle([
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
}
</style>
