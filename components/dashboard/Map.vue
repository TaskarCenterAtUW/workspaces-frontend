<template>
  <div class="map-container">
    <div
      v-show="workspaceAreaPolygon"
      ref="mapElement"
      class="workspace-map-surface"
    />
    <div
      v-show="!workspaceAreaPolygon"
      class="missing-workspace-area-notice"
    >
      <loading-spinner v-if="loadingBbox.active" />
      <template v-else>
        <app-icon
          variant="info"
          size="48"
        />
        <div>This workspace is empty.</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading';
import { workspacesClient } from '~/services/index';

import type { Workspace, WorkspaceCenter } from '~/types/workspaces';

interface Props {
  workspace: Workspace;
}

interface LeafletBounds {
  getCenter: () => { lat: number; lng: number };
  isValid: () => boolean;
}

interface LeafletMap {
  fitBounds: (bounds: LeafletBounds) => void;
  getBoundsZoom: (bounds: LeafletBounds) => number;
  remove: () => void;
}

interface LeafletPolygon {
  addTo: (map: LeafletMap) => void;
  getBounds: () => LeafletBounds;
  remove: () => void;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  centerLoaded: [center: WorkspaceCenter];
}>();

const loadingBbox = reactive(new LoadingContext());
const mapElement = ref<HTMLElement | null>(null);
const map = ref<LeafletMap | null>(null);
const workspaceAreaPolygon = ref<LeafletPolygon | null>(null);

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

onBeforeUnmount(() => {
  loadingBbox.abort();
  workspaceAreaPolygon.value?.remove();
  map.value?.remove();
});

function initMap() {
  if (!mapElement.value) {
    return;
  }

  map.value = L.map(mapElement.value) as LeafletMap;

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map.value);
}

async function updateMapPreview(workspace: Workspace) {
  if (workspaceAreaPolygon.value) {
    workspaceAreaPolygon.value.remove();
    workspaceAreaPolygon.value = null
  }

  if (!workspace.id) {
    return;
  }

  await setCurrentWorkspacePolygon(workspace);

  const polygon = workspaceAreaPolygon.value as LeafletPolygon | null;
  if (!polygon) {
    return;
  }

  if (!map.value) {
    initMap();
  }

  const bounds = polygon.getBounds();

  if (!map.value) {
    return;
  }

  polygon.addTo(map.value);
  map.value.fitBounds(bounds);

  const zoom = map.value.getBoundsZoom(bounds);
  const center = bounds.getCenter();

  emit('centerLoaded', { zoom, latitude: center.lat, longitude: center.lng });
}

async function setCurrentWorkspacePolygon(workspace: Workspace) {
  const metadataArea = getMetadataArea(workspace.tdeiMetadata);

  if (metadataArea) {
    const polygon = L.geoJSON(metadataArea) as LeafletPolygon;

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
      ]) as LeafletPolygon;
    }
  });
}

function getMetadataArea(metadata: unknown): unknown {
  if (!isRecord(metadata) || !isRecord(metadata.metadata)) {
    return undefined;
  }

  const datasetDetail = metadata.metadata.dataset_detail;
  return isRecord(datasetDetail) ? datasetDetail.dataset_area : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

$dashboard-map-min-height: 10rem;
$dashboard-map-height-mobile: 18rem;

.map-container {
  height: 100%;
  min-height: $dashboard-map-min-height;
  background-color: $gray-200;
}

.workspace-map-surface,
.missing-workspace-area-notice {
  width: 100%;
  height: 100%;
}

.missing-workspace-area-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: $gray-600;
  text-align: center;
}

@include media-breakpoint-down(md) {
  .map-container {
    height: $dashboard-map-height-mobile;
    min-height: 0;
  }
}
</style>
