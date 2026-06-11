<template>
  <div ref="mapRef" class="project-wizard-map" />
</template>

<script lang="ts">
import type { StyleSpecification } from 'maplibre-gl';
</script>

<script setup lang="ts">
import maplibregl from 'maplibre-gl';

import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FillLayerSpecification,
  GeoJSONSource,
  LineLayerSpecification,
  PaddingOptions,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { ProjectWizardMapFeatureCollection, ProjectWizardMapState } from '~/types/project-wizard';

interface Props {
  cameraPadding?: Partial<PaddingOptions>;
  mapState?: ProjectWizardMapState;
}

const props = defineProps<Props>();

const DEFAULT_CENTER: [number, number] = [-122.3321, 47.6062];
const SOURCE_ID = 'project-wizard-features';
const POLYGON_FILL_ID = 'project-wizard-polygon-fill';
const POLYGON_LINE_ID = 'project-wizard-polygon-line';
const LINE_ID = 'project-wizard-line';
const POINT_ID = 'project-wizard-point';
const LABEL_ID = 'project-wizard-label';

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

let wizardMap: maplibregl.Map | undefined;

const emptyCollection: ProjectWizardMapFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

onMounted(() => {
  if (!mapRef.value) {
    return;
  }

  wizardMap = new maplibregl.Map({
    container: mapRef.value,
    style: baseMapStyle,
    center: DEFAULT_CENTER,
    zoom: 8,
  });

  wizardMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  wizardMap.on('load', () => {
    ensureLayers();
    applyMapState(props.mapState);
  });
});

watch(
  () => [props.mapState, props.cameraPadding],
  () => {
    applyMapState(props.mapState);
  },
  { deep: true },
);

onBeforeUnmount(() => {
  wizardMap?.remove();
});

function ensureLayers() {
  if (!wizardMap || wizardMap.getSource(SOURCE_ID)) {
    return;
  }

  wizardMap.addSource(SOURCE_ID, {
    type: 'geojson',
    data: emptyCollection,
  });

  const polygonFillLayer: FillLayerSpecification = {
    id: POLYGON_FILL_ID,
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': toneExpression('#3f1a8a', '#2a9ec6', '#8b92ab'),
      'fill-opacity': 0.16,
    },
  };

  const polygonLineLayer: LineLayerSpecification = {
    id: POLYGON_LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': toneExpression('#3f1a8a', '#2a9ec6', '#8b92ab'),
      'line-width': 2,
    },
  };

  const lineLayer: LineLayerSpecification = {
    id: LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': toneExpression('#3f1a8a', '#2a9ec6', '#8b92ab'),
      'line-width': 2.5,
    },
  };

  const pointLayer: CircleLayerSpecification = {
    id: POINT_ID,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 7,
      'circle-color': toneExpression('#3f1a8a', '#2a9ec6', '#8b92ab'),
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  };

  const labelLayer: SymbolLayerSpecification = {
    id: LABEL_ID,
    type: 'symbol',
    source: SOURCE_ID,
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

  wizardMap.addLayer(polygonFillLayer);
  wizardMap.addLayer(polygonLineLayer);
  wizardMap.addLayer(lineLayer);
  wizardMap.addLayer(pointLayer);
  wizardMap.addLayer(labelLayer);
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

function applyMapState(state?: ProjectWizardMapState) {
  if (!wizardMap || !wizardMap.isStyleLoaded()) {
    return;
  }

  const source = wizardMap.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(state?.features ?? emptyCollection);

  wizardMap.easeTo({
    center: state?.center ?? DEFAULT_CENTER,
    zoom: state?.zoom ?? 8,
    padding: {
      top: props.cameraPadding?.top ?? 48,
      right: props.cameraPadding?.right ?? 48,
      bottom: props.cameraPadding?.bottom ?? 48,
      left: props.cameraPadding?.left ?? 48,
    },
    duration: 500,
    essential: true,
  });
}
</script>

<style lang="scss" scoped>
.project-wizard-map {
  width: 100%;
  height: 100%;
}
</style>
