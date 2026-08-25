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
import { createMaplibreMap } from '~/util/map-style';
import { bboxToPolygon, getGeoJsonBounds } from '~/util/geojson';

import type { Workspace, WorkspaceCenter } from '~/types/workspaces';

interface Props {
  workspace: Workspace;
}

type MapState = 'loading' | 'ready' | 'empty' | 'error';
type Bounds = [[number, number], [number, number]];

interface WorkspaceArea {
  geojson: unknown;
  bounds: Bounds;
}

const AREA_SOURCE_ID = 'workspace-preview-area';
const AREA_FILL_ID = 'workspace-preview-area-fill';
const AREA_LINE_ID = 'workspace-preview-area-line';
const AREA_COLOR = '#3388ff';
const AREA_PADDING = 24;
const emptyCollection = { type: 'FeatureCollection', features: [] };

const props = defineProps<Props>();
const emit = defineEmits<{
  centerLoaded: [center: WorkspaceCenter];
}>();

const loadingBbox = reactive(new LoadingContext());
const mapElement = ref<HTMLElement | null>(null);
const mapState = ref<MapState>('loading');

let maplibregl: typeof import('maplibre-gl') | null = null;
let map: import('maplibre-gl').Map | null = null;
let mapReadyPromise: Promise<void> | null = null;
let currentAreaBounds: Bounds | null = null;
let mapRequestId = 0;
let resizeObserver: ResizeObserver | undefined;
let resizeFrame: number | undefined;

function resizeMap() {
  if (resizeFrame !== undefined) {
    cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined;

    if (mapState.value !== 'ready' || !map || !maplibregl || !currentAreaBounds) {
      return;
    }

    map.resize();

    const camera = map.cameraForBounds(currentAreaBounds, { padding: AREA_PADDING });

    if (!camera?.center || camera.zoom === undefined) {
      return;
    }

    map.jumpTo(camera);

    const center = maplibregl.LngLat.convert(camera.center);

    emit('centerLoaded', {
      zoom: camera.zoom,
      latitude: center.lat,
      longitude: center.lng
    });
  });
}

// Memoized so concurrent workspace switches share one in-flight init instead
// of racing to create duplicate maplibregl.Map instances.
function ensureMap(): Promise<void> {
  if (!mapReadyPromise) {
    mapReadyPromise = initMap();
  }

  return mapReadyPromise;
}

async function initMap(): Promise<void> {
  if (!mapElement.value) {
    return;
  }

  const handle = await createMaplibreMap(mapElement.value, { center: [0, 0], zoom: 0 });

  maplibregl = handle.maplibregl;
  map = handle.map;

  await handle.ready;

  map.addSource(AREA_SOURCE_ID, { type: 'geojson', data: emptyCollection as any });
  map.addLayer({
    id: AREA_FILL_ID,
    type: 'fill',
    source: AREA_SOURCE_ID,
    paint: { 'fill-color': AREA_COLOR, 'fill-opacity': 0.2 },
  });
  map.addLayer({
    id: AREA_LINE_ID,
    type: 'line',
    source: AREA_SOURCE_ID,
    paint: { 'line-color': AREA_COLOR, 'line-width': 3 },
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

  map?.remove();
  map = null;
  mapReadyPromise = null;
});

async function getWorkspaceArea(workspace: Workspace): Promise<WorkspaceArea | null> {
  const metadataArea = getMetadataArea(parseMetadata(workspace.tdeiMetadata));
  const metadataBounds = metadataArea ? getGeoJsonBounds(metadataArea) : null;

  if (metadataArea && metadataBounds) {
    return { geojson: metadataArea, bounds: metadataBounds };
  }

  let area: WorkspaceArea | null = null;

  await loadingBbox.cancelable(workspacesClient, async (client) => {
    const bbox = await client.getWorkspaceBbox(workspace.id);

    if (!bbox) {
      return;
    }

    area = {
      geojson: bboxToPolygon(bbox.min_lat, bbox.min_lon, bbox.max_lat, bbox.max_lon),
      bounds: [[bbox.min_lon, bbox.min_lat], [bbox.max_lon, bbox.max_lat]],
    };
  });

  return area;
}

async function updateMapPreview(workspace: Workspace) {
  const requestId = ++mapRequestId;

  // Cancel a previous bbox request even if this workspace uses metadata.
  loadingBbox.abort();

  currentAreaBounds = null;
  mapState.value = 'loading';

  try {
    const area = await getWorkspaceArea(workspace);

    // The user selected another workspace while this one was loading.
    if (requestId !== mapRequestId) {
      return;
    }

    if (!area) {
      mapState.value = 'empty';
      return;
    }

    mapState.value = 'ready';

    // Wait until v-show makes the map surface visible.
    await nextTick();

    if (requestId !== mapRequestId) {
      return;
    }

    await ensureMap();

    if (requestId !== mapRequestId) {
      return;
    }

    if (!map) {
      mapState.value = 'error';
      return;
    }

    const source = map.getSource(AREA_SOURCE_ID) as import('maplibre-gl').GeoJSONSource | undefined;
    source?.setData(area.geojson as any);
    currentAreaBounds = area.bounds;
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
