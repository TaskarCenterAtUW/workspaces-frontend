<template>
  <div
    ref="mapRef"
    class="project-wizard-map"
    :class="{
      'project-wizard-map-editable': editable,
      'project-wizard-map-drawing': drawMode,
    }"
  />
</template>

<script lang="ts">
import type { StyleSpecification } from 'maplibre-gl';
</script>

<script setup lang="ts">
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
} from 'geojson';
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FillLayerSpecification,
  GeoJSONSource,
  LineLayerSpecification,
  MapLayerMouseEvent,
  MapMouseEvent,
  PaddingOptions,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type {
  ProjectWizardAreaFeature,
  ProjectWizardMapState,
} from '~/types/project-wizard';

import {
  buildProjectWizardAoiFeatureFromVertices,
  getProjectWizardAoiBounds,
  getProjectWizardAoiVertices,
} from '~/services/project-wizard-aoi';

interface Props {
  aoi?: ProjectWizardAreaFeature | null;
  cameraPadding?: Partial<PaddingOptions>;
  drawMode?: boolean;
  editable?: boolean;
  mapState?: ProjectWizardMapState;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:aoi': [feature: ProjectWizardAreaFeature | null];
  'update:draw-mode': [value: boolean];
}>();

const DEFAULT_CENTER: [number, number] = [-122.3321, 47.6062];
const OVERLAY_SOURCE_ID = 'project-wizard-overlay-features';
const AOI_SOURCE_ID = 'project-wizard-aoi-feature';
const DRAFT_SOURCE_ID = 'project-wizard-draft-feature';
const VERTEX_SOURCE_ID = 'project-wizard-vertex-feature';
const OVERLAY_POLYGON_FILL_ID = 'project-wizard-overlay-polygon-fill';
const OVERLAY_POLYGON_LINE_ID = 'project-wizard-overlay-polygon-line';
const OVERLAY_LINE_ID = 'project-wizard-overlay-line';
const OVERLAY_POINT_ID = 'project-wizard-overlay-point';
const OVERLAY_LABEL_ID = 'project-wizard-overlay-label';
const AOI_FILL_ID = 'project-wizard-aoi-fill';
const AOI_LINE_ID = 'project-wizard-aoi-line';
const DRAFT_LINE_ID = 'project-wizard-draft-line';
const DRAFT_POINT_ID = 'project-wizard-draft-point';
const VERTEX_POINT_ID = 'project-wizard-vertex-point';

const mapRef = useTemplateRef<HTMLDivElement>('mapRef');

const baseMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
};

const emptyCollection: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

type VertexFeature = Feature<Point, { vertexIndex: number }>;

let maplibregl: typeof import('maplibre-gl') | null = null;
let wizardMap: import('maplibre-gl').Map | null = null;
let isDraggingVertex = false;
let activeVertexIndex: number | null = null;
let pendingVertices: [number, number][] = [];
let previewCoordinate: [number, number] | null = null;
let skipNextAoiFit = false;

onMounted(async () => {
  if (!mapRef.value) {
    return;
  }

  maplibregl = await import('maplibre-gl');

  wizardMap = new maplibregl.Map({
    container: mapRef.value,
    style: baseMapStyle,
    center: DEFAULT_CENTER,
    zoom: 8,
  });

  wizardMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  wizardMap.on('load', () => {
    ensureLayers();
    bindInteractionHandlers();
    syncSources();
    syncInteractionState();
    applyViewport();
  });
});

watch(
  () => [props.mapState, props.aoi, props.cameraPadding, props.editable],
  () => {
    syncSources();
    syncInteractionState();
    applyViewport();
  },
  { deep: true },
);

watch(
  () => props.drawMode,
  (isDrawing) => {
    if (!isDrawing) {
      pendingVertices = [];
      previewCoordinate = null;
    }

    syncSources();
    syncInteractionState();
  },
);

onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('mouseup', handlePointerRelease);
  }

  wizardMap?.remove();
  wizardMap = null;
});

function ensureLayers() {
  if (!wizardMap || wizardMap.getSource(OVERLAY_SOURCE_ID)) {
    return;
  }

  wizardMap.addSource(OVERLAY_SOURCE_ID, {
    type: 'geojson',
    data: emptyCollection,
  });

  wizardMap.addSource(AOI_SOURCE_ID, {
    type: 'geojson',
    data: emptyCollection,
  });

  wizardMap.addSource(DRAFT_SOURCE_ID, {
    type: 'geojson',
    data: emptyCollection,
  });

  wizardMap.addSource(VERTEX_SOURCE_ID, {
    type: 'geojson',
    data: emptyCollection,
  });

  const overlayPolygonFillLayer: FillLayerSpecification = {
    id: OVERLAY_POLYGON_FILL_ID,
    type: 'fill',
    source: OVERLAY_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': toneExpression('#3f1a8a', '#2a9ec6', '#8b92ab'),
      'fill-opacity': 0.16,
    },
  };

  const overlayPolygonLineLayer: LineLayerSpecification = {
    id: OVERLAY_POLYGON_LINE_ID,
    type: 'line',
    source: OVERLAY_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': toneExpression('#3f1a8a', '#2a9ec6', '#8b92ab'),
      'line-width': 2,
    },
  };

  const overlayLineLayer: LineLayerSpecification = {
    id: OVERLAY_LINE_ID,
    type: 'line',
    source: OVERLAY_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': toneExpression('#3f1a8a', '#2a9ec6', '#8b92ab'),
      'line-width': 2.5,
    },
  };

  const overlayPointLayer: CircleLayerSpecification = {
    id: OVERLAY_POINT_ID,
    type: 'circle',
    source: OVERLAY_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 7,
      'circle-color': toneExpression('#3f1a8a', '#2a9ec6', '#8b92ab'),
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  };

  const overlayLabelLayer: SymbolLayerSpecification = {
    id: OVERLAY_LABEL_ID,
    type: 'symbol',
    source: OVERLAY_SOURCE_ID,
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'label']],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Open Sans Regular'],
      'text-offset': [0, 1.25],
      'text-size': 12,
    },
    paint: {
      'text-color': '#24305e',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1,
    },
  };

  const aoiFillLayer: FillLayerSpecification = {
    id: AOI_FILL_ID,
    type: 'fill',
    source: AOI_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': '#e8c77a',
      'fill-opacity': 0.18,
    },
  };

  const aoiLineLayer: LineLayerSpecification = {
    id: AOI_LINE_ID,
    type: 'line',
    source: AOI_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': '#d9a43d',
      'line-width': 2.5,
      'line-dasharray': [2, 2],
    },
  };

  const draftLineLayer: LineLayerSpecification = {
    id: DRAFT_LINE_ID,
    type: 'line',
    source: DRAFT_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': '#d9a43d',
      'line-width': 2.5,
      'line-dasharray': [2, 2],
    },
  };

  const draftPointLayer: CircleLayerSpecification = {
    id: DRAFT_POINT_ID,
    type: 'circle',
    source: DRAFT_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 5.5,
      'circle-color': '#f4c765',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  };

  const vertexPointLayer: CircleLayerSpecification = {
    id: VERTEX_POINT_ID,
    type: 'circle',
    source: VERTEX_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 6.5,
      'circle-color': '#f4c765',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  };

  wizardMap.addLayer(overlayPolygonFillLayer);
  wizardMap.addLayer(overlayPolygonLineLayer);
  wizardMap.addLayer(overlayLineLayer);
  wizardMap.addLayer(overlayPointLayer);
  wizardMap.addLayer(overlayLabelLayer);
  wizardMap.addLayer(aoiFillLayer);
  wizardMap.addLayer(aoiLineLayer);
  wizardMap.addLayer(draftLineLayer);
  wizardMap.addLayer(draftPointLayer);
  wizardMap.addLayer(vertexPointLayer);
}

function bindInteractionHandlers() {
  if (!wizardMap) {
    return;
  }

  if (import.meta.client) {
    window.addEventListener('mouseup', handlePointerRelease, { passive: true });
  }

  wizardMap.on('click', handleMapClick);
  wizardMap.on('dblclick', handleMapDoubleClick);
  wizardMap.on('mousemove', handleMapMouseMove);
  wizardMap.on('mouseup', handlePointerRelease);
  wizardMap.on('mouseenter', VERTEX_POINT_ID, handleVertexMouseEnter);
  wizardMap.on('mouseleave', VERTEX_POINT_ID, handleVertexMouseLeave);
  wizardMap.on('mousedown', VERTEX_POINT_ID, handleVertexDragStart);
}

function syncSources() {
  if (!wizardMap || !wizardMap.isStyleLoaded()) {
    return;
  }

  const overlaySource = wizardMap.getSource(OVERLAY_SOURCE_ID) as GeoJSONSource | undefined;
  const aoiSource = wizardMap.getSource(AOI_SOURCE_ID) as GeoJSONSource | undefined;
  const draftSource = wizardMap.getSource(DRAFT_SOURCE_ID) as GeoJSONSource | undefined;
  const vertexSource = wizardMap.getSource(VERTEX_SOURCE_ID) as GeoJSONSource | undefined;

  overlaySource?.setData(props.mapState?.features ?? emptyCollection);
  aoiSource?.setData(createAoiFeatureCollection());
  draftSource?.setData(createDraftFeatureCollection());
  vertexSource?.setData(createVertexFeatureCollection());
}

function syncInteractionState() {
  if (!wizardMap) {
    return;
  }

  if (props.drawMode) {
    wizardMap.doubleClickZoom.disable();
    wizardMap.getCanvas().style.cursor = 'crosshair';
    return;
  }

  wizardMap.doubleClickZoom.enable();
  wizardMap.getCanvas().style.cursor = props.editable ? 'grab' : '';
}

function applyViewport() {
  if (!wizardMap) {
    return;
  }

  const aoiBounds = getProjectWizardAoiBounds(props.aoi ?? null);

  if (aoiBounds) {
    if (skipNextAoiFit) {
      skipNextAoiFit = false;
      return;
    }

    wizardMap.fitBounds(aoiBounds, {
      padding: resolvePadding(),
      duration: 500,
      essential: true,
      maxZoom: 11.5,
    });
    return;
  }

  wizardMap.easeTo({
    center: props.mapState?.center ?? DEFAULT_CENTER,
    zoom: props.mapState?.zoom ?? 8,
    padding: resolvePadding(),
    duration: 500,
    essential: true,
  });
}

function resolvePadding(): PaddingOptions {
  return {
    top: props.cameraPadding?.top ?? 48,
    right: props.cameraPadding?.right ?? 48,
    bottom: props.cameraPadding?.bottom ?? 48,
    left: props.cameraPadding?.left ?? 48,
  };
}

function handleMapClick(event: MapMouseEvent) {
  if (!props.editable || !props.drawMode) {
    return;
  }

  const nextCoordinate: [number, number] = [event.lngLat.lng, event.lngLat.lat];
  const lastCoordinate = pendingVertices[pendingVertices.length - 1];

  if (lastCoordinate && lastCoordinate[0] === nextCoordinate[0] && lastCoordinate[1] === nextCoordinate[1]) {
    return;
  }

  pendingVertices = [...pendingVertices, nextCoordinate];
  previewCoordinate = nextCoordinate;
  syncSources();
}

function handleMapDoubleClick(event: MapMouseEvent) {
  if (!props.editable || !props.drawMode) {
    return;
  }

  event.preventDefault();

  const nextFeature = buildProjectWizardAoiFeatureFromVertices(pendingVertices);

  if (!nextFeature) {
    return;
  }

  skipNextAoiFit = true;
  pendingVertices = [];
  previewCoordinate = null;
  emit('update:aoi', nextFeature);
  emit('update:draw-mode', false);
  syncSources();
}

function handleMapMouseMove(event: MapMouseEvent) {
  if (!wizardMap) {
    return;
  }

  if (isDraggingVertex && activeVertexIndex !== null && props.aoi) {
    const updatedVertices = [...getProjectWizardAoiVertices(props.aoi)];
    updatedVertices.splice(activeVertexIndex, 1, [event.lngLat.lng, event.lngLat.lat]);

    const nextFeature = buildProjectWizardAoiFeatureFromVertices(updatedVertices);
    if (!nextFeature) {
      return;
    }

    skipNextAoiFit = true;
    emit('update:aoi', nextFeature);
    return;
  }

  if (props.drawMode && pendingVertices.length > 0) {
    previewCoordinate = [event.lngLat.lng, event.lngLat.lat];
    syncSources();
  }
}

function handleVertexDragStart(event: MapLayerMouseEvent) {
  if (!wizardMap || !props.editable || props.drawMode) {
    return;
  }

  const vertexFeature = event.features?.[0] as VertexFeature | undefined;
  const vertexIndex = vertexFeature?.properties?.vertexIndex;

  if (typeof vertexIndex !== 'number') {
    return;
  }

  isDraggingVertex = true;
  activeVertexIndex = vertexIndex;
  wizardMap.dragPan.disable();
  wizardMap.getCanvas().style.cursor = 'grabbing';
}

function handleVertexMouseEnter() {
  if (!wizardMap || !props.editable || props.drawMode) {
    return;
  }

  wizardMap.getCanvas().style.cursor = 'grab';
}

function handleVertexMouseLeave() {
  if (!wizardMap || isDraggingVertex || props.drawMode) {
    return;
  }

  wizardMap.getCanvas().style.cursor = props.editable ? 'grab' : '';
}

function handlePointerRelease() {
  if (!wizardMap || !isDraggingVertex) {
    return;
  }

  isDraggingVertex = false;
  activeVertexIndex = null;
  wizardMap.dragPan.enable();
  wizardMap.getCanvas().style.cursor = props.editable ? 'grab' : '';
}

function createAoiFeatureCollection(): FeatureCollection {
  if (props.drawMode && pendingVertices.length > 0) {
    return emptyCollection;
  }

  if (!props.aoi) {
    return emptyCollection;
  }

  return {
    type: 'FeatureCollection',
    features: [props.aoi],
  };
}

function createDraftFeatureCollection(): FeatureCollection {
  if (!props.drawMode || pendingVertices.length === 0) {
    return emptyCollection;
  }

  const features: Array<Feature<Point | LineString>> = pendingVertices.map(coordinate => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: coordinate,
    },
    properties: {},
  }));

  const lineCoordinates = previewCoordinate
    ? [...pendingVertices, previewCoordinate]
    : [...pendingVertices];

  if (lineCoordinates.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: lineCoordinates,
      },
      properties: {},
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

function createVertexFeatureCollection(): FeatureCollection {
  if (!props.editable) {
    return emptyCollection;
  }

  const vertices = props.drawMode && pendingVertices.length > 0
    ? pendingVertices
    : getProjectWizardAoiVertices(props.aoi ?? null);

  if (vertices.length === 0) {
    return emptyCollection;
  }

  return {
    type: 'FeatureCollection',
    features: vertices.map((coordinate, vertexIndex) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: coordinate,
      },
      properties: {
        vertexIndex,
      },
    })),
  };
}

function toneExpression(
  primaryColor: string,
  accentColor: string,
  mutedColor: string,
): ExpressionSpecification {
  return [
    'match',
    ['coalesce', ['get', 'tone'], 'primary'],
    'accent', accentColor,
    'muted', mutedColor,
    primaryColor,
  ];
}
</script>

<style lang="scss" scoped>
.project-wizard-map {
  width: 100%;
  height: 100%;
}
</style>
