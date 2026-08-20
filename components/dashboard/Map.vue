<template>
  <div class="map-container">
    <div
      v-show="mapState === 'ready'"
      ref="mapElement"
      class="workspace-map-surface"
    />
    <div
      v-show="mapState !== 'ready'"
      class="missing-workspace-area-notice"
      aria-live="polite"
    >
      <loading-spinner v-if="mapState === 'loading'" />
      <template v-else>
        <app-icon
          :variant="mapState === 'error' ? 'error_outline' : 'info'"
          size="48"
        />
        <div v-if="mapState === 'error'">
          The map preview could not be loaded.
        </div>
        <div v-else>
          This workspace does not contain map data.
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading';
import { workspacesClient } from '~/services/index';
import { isRecord, parseMetadata } from '~/util/metadata';
import { OPENFREEMAP_STYLE_URL } from '~/util/map-style';

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
  invalidateSize: (options?: { animate?: boolean; pan?: boolean }) => void;
  remove: () => void;
}

interface LeafletPolygon {
  addTo: (map: LeafletMap) => void;
  getBounds: () => LeafletBounds;
  remove: () => void;
}

type MapState = 'loading' | 'ready' | 'empty' | 'error';

const props = defineProps<Props>();
const emit = defineEmits<{
  centerLoaded: [center: WorkspaceCenter];
}>();

const loadingBbox = reactive(new LoadingContext());
const mapElement = ref<HTMLElement | null>(null);
const map = ref<LeafletMap | null>(null);
const workspaceAreaPolygon = ref<LeafletPolygon | null>(null);
const mapState = ref<MapState>('loading');

let mapRequestId = 0;
let resizeObserver: ResizeObserver | undefined;
let resizeFrame: number | undefined;

function resizeMap() {
  if (resizeFrame !== undefined) {
    cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined;

    if (
      mapState.value !== 'ready'
      || !map.value
      || !workspaceAreaPolygon.value
    ) {
      return;
    }

    const bounds = workspaceAreaPolygon.value.getBounds();

    map.value.invalidateSize({
      animate: false,
      pan: false
    });
    map.value.fitBounds(bounds);

    const zoom = map.value.getBoundsZoom(bounds);
    const center = bounds.getCenter();

    emit('centerLoaded', {
      zoom,
      latitude: center.lat,
      longitude: center.lng
    });
  });
}

onMounted(() => {
  if (mapElement.value) {
    resizeObserver = new ResizeObserver(resizeMap);
    resizeObserver.observe(mapElement.value);
  }

  watch(
    () => props.workspace,
    workspace => void updateMapPreview(workspace),
    { immediate: true }
  );
});

onBeforeUnmount(() => {
  mapRequestId++;
  loadingBbox.abort();
  resizeObserver?.disconnect();

  if (resizeFrame !== undefined) {
    cancelAnimationFrame(resizeFrame);
  }

  workspaceAreaPolygon.value?.remove();
  map.value?.remove();
});

function initMap() {
  if (!mapElement.value) {
    return;
  }

  map.value = L.map(mapElement.value) as LeafletMap;

  L.maplibreGL({ style: OPENFREEMAP_STYLE_URL }).addTo(map.value);
}

async function getWorkspacePolygon(
  workspace: Workspace
): Promise<LeafletPolygon | null> {
  const metadataArea = getMetadataArea(parseMetadata(workspace.tdeiMetadata));

  if (metadataArea) {
    const polygon = L.geoJSON(metadataArea) as LeafletPolygon;

    if (polygon.getBounds().isValid()) {
      return polygon;
    }
  }

  let polygon: LeafletPolygon | null = null;

  await loadingBbox.cancelable(workspacesClient, async (client) => {
    const bbox = await client.getWorkspaceBbox(workspace.id);

    if (!bbox) {
      return;
    }

    polygon = L.rectangle([
      [bbox.min_lat, bbox.min_lon],
      [bbox.max_lat, bbox.max_lon]
    ]) as LeafletPolygon;
  });

  return polygon;
}

async function updateMapPreview(workspace: Workspace) {
  const requestId = ++mapRequestId;

  // Cancel a previous bbox request even if this workspace uses metadata.
  loadingBbox.abort();

  workspaceAreaPolygon.value?.remove();
  workspaceAreaPolygon.value = null;
  mapState.value = 'loading';

  try {
    const polygon = await getWorkspacePolygon(workspace);

    // The user selected another workspace while this one was loading.
    if (requestId !== mapRequestId) {
      return;
    }

    if (!polygon) {
      mapState.value = 'empty';
      return;
    }

    const bounds = polygon.getBounds();

    if (!bounds.isValid()) {
      mapState.value = 'error';
      return;
    }

    workspaceAreaPolygon.value = polygon;
    mapState.value = 'ready';

    // Wait until v-show makes the map surface visible.
    await nextTick();

    if (requestId !== mapRequestId) {
      return;
    }

    if (!map.value) {
      initMap();
    }

    if (!map.value) {
      mapState.value = 'error';
      return;
    }

    polygon.addTo(map.value);
    resizeMap();
  }
  catch (error: unknown) {
    if (requestId !== mapRequestId) {
      return;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }

    mapState.value = 'error';
  }
}

function getMetadataArea(metadata: Record<string, unknown> | null): unknown {
  if (metadata == null || !isRecord(metadata.metadata)) {
    return undefined;
  }

  const datasetDetail = metadata.metadata.dataset_detail;
  return isRecord(datasetDetail) ? datasetDetail.dataset_area : undefined;
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
