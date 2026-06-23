<template>
  <!--
    Interactive MapLibre GL map for the project detail page.

    Responsibilities:
    - Renders the Area of Interest (AOI) as a semi-transparent fill with a dashed outline.
    - Renders individual project tasks as coloured polygons (colour = task status).
    - Renders a task-grid preview (used during the task-setup workflow).
    - Shows lock icons on the map canvas for tasks that are locked by a mapper.
    - Highlights the selected task and emits `select-task` when a task polygon is clicked.
  -->
  <section class="project-detail-map-shell" aria-label="Project tasks map">
    <div ref="mapRef" class="project-detail-map" />

    <div v-if="showLegend" class="project-detail-map-overlay">
      <aside class="project-detail-map-legend" aria-label="Task legend">
        <h2>Legend</h2>

        <ul>
          <li v-for="item in legendItems" :key="item.label">
            <span
              class="project-detail-map-legend-swatch"
              :style="{ backgroundColor: item.color }"
            />
            {{ item.label }}
          </li>
          <li>
            <span class="project-detail-map-legend-lock">
              <app-icon variant="lock" size="18" no-margin />
            </span>
            Locked
          </li>
        </ul>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * ProjectMap.vue
 *
 * Interactive MapLibre GL map used on the project detail page.
 *
 * Layer stack (bottom to top):
 *   1. OSM raster tiles (base map)
 *   2. AOI fill (semi-transparent yellow)
 *   3. Task-grid fill + line (preview grid shown before tasks are saved)
 *   4. Task fill + line (real saved tasks, colour-coded by status)
 *   5. AOI outline (dashed yellow line on top of everything)
 *   6. Lock markers (DOM buttons rendered as MapLibre Markers above all layers)
 *
 * Data flow:
 *   props → computed FeatureCollections → `syncSources()` → MapLibre sources → rendered layers
 *   User clicks on task layer → `handleTaskClick` → emit('select-task', id) → parent page
 */
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson';
import type {
  FillLayerSpecification,
  GeoJSONSource,
  LineLayerSpecification,
  LngLatBoundsLike,
  MapLayerMouseEvent,
  Marker,
  PaddingOptions,
  StyleSpecification,
} from 'maplibre-gl';

import type {
  WorkspaceProjectAoiFeature,
  WorkspaceProjectTaskListItem,
} from '~/types/projects';
import type {
  ProjectWizardGeneratedTaskFeatureCollection,
  ProjectWizardTaskPreviewFeatureCollection,
} from '~/types/project-wizard';

interface Props {
  /** The project's area-of-interest polygon. Null when the project has no AOI yet. */
  aoi: WorkspaceProjectAoiFeature | null;
  /** The task ID that is currently highlighted/selected. */
  selectedTaskId?: string | null;
  /**
   * Optional task grid to show on the map. Used in two scenarios:
   * - Preview grid (task-setup workflow, before tasks are saved)
   * - Persisted task grid (built from saved task geometries on the detail page)
   */
  taskGrid?: ProjectWizardGeneratedTaskFeatureCollection | ProjectWizardTaskPreviewFeatureCollection | null;
  /** Saved project tasks. Each task has geometry + status used to colour the polygon. */
  tasks: WorkspaceProjectTaskListItem[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** Fired when the user clicks on a task polygon. The parent should update `selectedTaskId`. */
  'select-task': [taskId: string];
}>();

/** Ref to the div that MapLibre will mount into. */
const mapRef = useTemplateRef<HTMLDivElement>('mapRef');

// ─── MapLibre Source & Layer IDs ─────────────────────────────────────────────
const AOI_SOURCE_ID = 'project-detail-aoi';
const AOI_OUTLINE_SOURCE_ID = 'project-detail-aoi-outline';
const TASK_SOURCE_ID = 'project-detail-tasks';
const TASK_GRID_SOURCE_ID = 'project-detail-task-grid';
const AOI_FILL_ID = 'project-detail-aoi-fill';
const AOI_LINE_ID = 'project-detail-aoi-line';
const TASK_FILL_ID = 'project-detail-task-fill';
const TASK_LINE_ID = 'project-detail-task-line';
const TASK_GRID_FILL_ID = 'project-detail-task-grid-fill';
const TASK_GRID_LINE_ID = 'project-detail-task-grid-line';

/** Default map center (Seattle) shown when no AOI/tasks are available yet. */
const DEFAULT_CENTER: [number, number] = [-122.3321, 47.6062];

/**
 * Minimal MapLibre style that only loads OpenStreetMap raster tiles.
 * We don't use a hosted style (e.g. MapTiler) to keep things self-contained and free.
 */
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

/**
 * A reusable empty FeatureCollection used to initialise MapLibre sources.
 * Sources must have valid GeoJSON at creation time, so we give them this placeholder
 * and update them later via `setData()` once real data is available.
 */
const emptyCollection: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/** Colours to display in the legend — must stay in sync with the MapLibre paint expressions below. */
const legendItems = [
  { label: 'Ready for mapping', color: '#fde9aa' },
  { label: 'Ready for validation', color: '#a8d8f8' },
  { label: 'More mapping needed', color: '#f8be90' },
  { label: 'Completed', color: '#aae8cd' },
];

/**
 * Module-level references to the MapLibre instances.
 * These are intentionally NOT Vue refs because MapLibre manages its own internal state —
 * wrapping the map object in Vue's reactivity system would cause unnecessary overhead.
 * We only interact with them through regular function calls.
 */
let maplibregl: typeof import('maplibre-gl') | null = null;
let detailMap: import('maplibre-gl').Map | null = null;
/** Holds references to DOM Marker instances for locked tasks so we can remove them on update. */
let lockedTaskMarkers: Marker[] = [];

/** Show the legend only when there's something meaningful to show on the map. */
const showLegend = computed(() =>
  Boolean(props.aoi)
  || props.tasks.length > 0
  || Boolean(props.taskGrid?.features.length),
);

/**
 * Convert the task list items into a GeoJSON FeatureCollection that MapLibre can render.
 * Each feature carries `status`, `selected`, and `locked` properties which are used
 * by the paint expressions on the task fill/line layers to drive colours and widths.
 */
const taskFeatureCollection = computed<FeatureCollection<Polygon>>(() => ({
  type: 'FeatureCollection',
  features: props.tasks
    .filter(task => task.geometry)
    .map(task => ({
      type: 'Feature',
      geometry: task.geometry as Polygon,
      properties: {
        id: task.id,
        selected: task.id === props.selectedTaskId,
        status: task.status,
        taskNumber: task.taskNumber,
        locked: task.locked,
      },
    })),
}));

/**
 * The AOI polygon converted to LineStrings for the dashed-outline layer.
 * We use a separate source for the outline because MapLibre doesn't support
 * dashed fill-outlines directly — you need a dedicated `line` layer.
 */
const aoiOutlineFeatureCollection = computed<FeatureCollection<LineString | MultiLineString>>(() => ({
  type: 'FeatureCollection',
  features: props.aoi ? createOutlineFeatures(props.aoi.geometry) : [],
}));

/**
 * Pre-compute the center point of each locked task polygon.
 * This feeds `syncLockedTaskMarkers()` which places a lock-icon DOM button at each center.
 * We derive it as a computed so we only recalculate when tasks change, not on every map event.
 */
const lockedTaskMarkersData = computed(() =>
  props.tasks
    .filter(task => task.locked && task.geometry)
    .map((task) => {
      const center = getPolygonCenter(task.geometry as Polygon);

      return center
        ? {
            id: task.id,
            center,
          }
        : null;
    })
    .filter((item): item is { id: string; center: [number, number] } => item !== null),
);

/**
 * Lazy-load MapLibre GL on mount so it doesn't bloat the initial page bundle.
 * The map is only needed when this component is actually rendered, not on every page.
 *
 * Setup order matters:
 *   1. Create the Map instance.
 *   2. Add the navigation control (zoom buttons).
 *   3. Wait for the `load` event — sources/layers can only be added after the style is ready.
 *   4. Call ensureLayers() → bindInteractionHandlers() → syncSources() → fitMapToData().
 */
onMounted(async () => {
  if (!mapRef.value) {
    return;
  }

  maplibregl = await import('maplibre-gl');

  detailMap = new maplibregl.Map({
    container: mapRef.value,
    style: baseMapStyle,
    center: DEFAULT_CENTER,
    zoom: 9,
  });

  detailMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  detailMap.on('load', () => {
    ensureLayers();
    bindInteractionHandlers();
    syncSources();
    fitMapToData();
  });
});

/**
 * When any of the key data props change (AOI, tasks, task grid), push the updated
 * FeatureCollections into the MapLibre sources and re-fit the viewport.
 * `deep: true` is required here because the FeatureCollection objects are complex nested structures.
 */
watch(
  () => [props.aoi, taskFeatureCollection.value, props.taskGrid],
  () => {
    syncSources();
    fitMapToData();
  },
  { deep: true },
);

/**
 * Clean up the map instance when the component is torn down.
 * Failing to call `.remove()` leaks WebGL contexts and event listeners.
 */
onBeforeUnmount(() => {
  clearLockedTaskMarkers();
  detailMap?.remove();
  detailMap = null;
});

/**
 * Create all MapLibre sources and layers exactly once, after the style has loaded.
 * We guard with `getSource(AOI_SOURCE_ID)` so this is idempotent — calling it twice is safe.
 *
 * Layer order (painter's algorithm — later layers paint over earlier ones):
 *   aoiFill → taskGridFill → taskGridLine → taskFill → taskLine → aoiLine
 */
function ensureLayers() {
  if (!detailMap || detailMap.getSource(AOI_SOURCE_ID)) {
    return;
  }

  detailMap.addSource(AOI_SOURCE_ID, {
    type: 'geojson',
    data: emptyCollection,
  });

  detailMap.addSource(AOI_OUTLINE_SOURCE_ID, {
    type: 'geojson',
    data: emptyCollection,
  });

  detailMap.addSource(TASK_SOURCE_ID, {
    type: 'geojson',
    data: emptyCollection,
  });

  detailMap.addSource(TASK_GRID_SOURCE_ID, {
    type: 'geojson',
    data: emptyCollection,
  });

  const aoiFillLayer: FillLayerSpecification = {
    id: AOI_FILL_ID,
    type: 'fill',
    source: AOI_SOURCE_ID,
    paint: {
      'fill-color': '#fde9aa',
      'fill-opacity': 0.3,
    },
  };

  const aoiLineLayer: LineLayerSpecification = {
    id: AOI_LINE_ID,
    type: 'line',
    source: AOI_OUTLINE_SOURCE_ID,
    paint: {
      'line-color': '#d8aa48',
      'line-width': 2.4,
      'line-dasharray': [2.2, 1.8],
      'line-opacity': 0.96,
    },
  };

  const taskFillLayer: FillLayerSpecification = {
    id: TASK_FILL_ID,
    type: 'fill',
    source: TASK_SOURCE_ID,
    paint: {
      'fill-color': [
        'match',
        ['coalesce', ['get', 'status'], 'ready_for_mapping'],
        'ready_for_validation', '#a8d8f8',
        'needs_more_mapping', '#f8be90',
        'completed', '#aae8cd',
        '#fde9aa',
      ],
      'fill-opacity': [
        'case',
        ['==', ['get', 'selected'], true],
        0.94,
        0.82,
      ],
    },
  };

  const taskLineLayer: LineLayerSpecification = {
    id: TASK_LINE_ID,
    type: 'line',
    source: TASK_SOURCE_ID,
    paint: {
      'line-color': [
        'case',
        ['==', ['get', 'selected'], true],
        '#2f3858',
        '#8691a8',
      ],
      'line-width': [
        'case',
        ['==', ['get', 'selected'], true],
        2.6,
        1.7,
      ],
      'line-opacity': 0.92,
    },
  };

  const taskGridFillLayer: FillLayerSpecification = {
    id: TASK_GRID_FILL_ID,
    type: 'fill',
    source: TASK_GRID_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': '#fde9aa',
      'fill-opacity': 0.4,
      'fill-outline-color': '#8f9ab1',
    },
  };

  const taskGridLineLayer: LineLayerSpecification = {
    id: TASK_GRID_LINE_ID,
    type: 'line',
    source: TASK_GRID_SOURCE_ID,
    paint: {
      'line-color': '#8f9ab1',
      'line-width': 1.9,
      'line-opacity': 0.98,
    },
  };

  detailMap.addLayer(aoiFillLayer);
  detailMap.addLayer(taskGridFillLayer);
  detailMap.addLayer(taskGridLineLayer);
  detailMap.addLayer(taskFillLayer);
  detailMap.addLayer(taskLineLayer);
  detailMap.addLayer(aoiLineLayer);
}

/**
 * Wire up mouse-enter/leave (cursor changes) and click (task selection) events.
 * We listen on both the fill AND line layers because a click on the border of two
 * tasks might only hit the line layer, not the fill.
 */
function bindInteractionHandlers() {
  if (!detailMap) {
    return;
  }

  detailMap.on('mouseenter', TASK_FILL_ID, handleTaskMouseEnter);
  detailMap.on('mouseenter', TASK_LINE_ID, handleTaskMouseEnter);
  detailMap.on('mouseleave', TASK_FILL_ID, handleTaskMouseLeave);
  detailMap.on('mouseleave', TASK_LINE_ID, handleTaskMouseLeave);
  detailMap.on('click', TASK_FILL_ID, handleTaskClick);
  detailMap.on('click', TASK_LINE_ID, handleTaskClick);
}

/**
 * Push the latest data from props/computed values into the MapLibre GeoJSON sources.
 * This is called after the style loads (initial render) and every time watched props change.
 *
 * We guard with `isStyleLoaded()` because `setData()` will throw if called before the
 * style is ready — for example, if props change before the async `load` event fires.
 */
function syncSources() {
  if (!detailMap || !detailMap.isStyleLoaded()) {
    return;
  }

  const aoiSource = detailMap.getSource(AOI_SOURCE_ID) as GeoJSONSource | undefined;
  const aoiOutlineSource = detailMap.getSource(AOI_OUTLINE_SOURCE_ID) as GeoJSONSource | undefined;
  const taskSource = detailMap.getSource(TASK_SOURCE_ID) as GeoJSONSource | undefined;
  const taskGridSource = detailMap.getSource(TASK_GRID_SOURCE_ID) as GeoJSONSource | undefined;

  aoiSource?.setData(props.aoi ?? emptyCollection);
  aoiOutlineSource?.setData(aoiOutlineFeatureCollection.value);
  taskSource?.setData(taskFeatureCollection.value);
  taskGridSource?.setData(props.taskGrid ?? emptyCollection);
  syncLockedTaskMarkers();
}

/**
 * Zoom and pan the map to frame all available data.
 * Priority: task bounds > task-grid bounds > AOI bounds > default center.
 * On the tasks tab, real task geometry is the most important context — if we fit to a large AOI
 * first, newly created tasks can be technically present but visually imperceptible on initial load.
 * If nothing is available yet, we just ease back to the default Seattle center.
 */
function fitMapToData() {
  if (!detailMap) {
    return;
  }

  const aoiBounds = props.aoi ? getFeatureBounds(props.aoi.geometry) : null;
  const taskBounds = taskFeatureCollection.value.features.length > 0
    ? getFeatureCollectionBounds(taskFeatureCollection.value)
    : null;
  const taskGridBounds = props.taskGrid && props.taskGrid.features.length > 0
    ? getGenericFeatureCollectionBounds(props.taskGrid)
    : null;
  const bounds = taskBounds ?? taskGridBounds ?? aoiBounds;

  if (!bounds) {
    detailMap.easeTo({
      center: DEFAULT_CENTER,
      zoom: 9,
      duration: 400,
      essential: true,
    });
    return;
  }

  detailMap.fitBounds(bounds, {
    padding: resolvePadding(),
    duration: 500,
    maxZoom: 14,
    essential: true,
  });
}

/**
 * Returns the padding (in px) to apply when fitting the map to feature bounds.
 * Expressed as an object so we can later make per-side adjustments if the UI changes
 * (e.g. a side-panel overlapping the left side of the map).
 */
function resolvePadding(): PaddingOptions {
  return {
    top: 64,
    right: 64,
    bottom: 64,
    left: 64,
  };
}

/**
 * Calculates a bounding box [[minLng, minLat], [maxLng, maxLat]] for any FeatureCollection.
 * Used for the task-grid where geometry types are mixed (Polygon + LineString).
 * Returns null if the collection has no valid geometries.
 */
function getGenericFeatureCollectionBounds(featureCollection: FeatureCollection): LngLatBoundsLike | null {
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;

  for (const feature of featureCollection.features) {
    if (!feature.geometry) {
      continue;
    }

    const bounds = getAnyGeometryBounds(feature.geometry);

    if (!bounds) {
      continue;
    }

    minLongitude = Math.min(minLongitude, bounds[0][0]);
    minLatitude = Math.min(minLatitude, bounds[0][1]);
    maxLongitude = Math.max(maxLongitude, bounds[1][0]);
    maxLatitude = Math.max(maxLatitude, bounds[1][1]);
  }

  if (!Number.isFinite(minLongitude)) {
    return null;
  }

  return [
    [minLongitude, minLatitude],
    [maxLongitude, maxLatitude],
  ];
}

/** Same as getGenericFeatureCollectionBounds but typed specifically for Polygon collections. */
function getFeatureCollectionBounds(featureCollection: FeatureCollection<Polygon>): LngLatBoundsLike | null {
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;

  for (const feature of featureCollection.features) {
    const bounds = getFeatureBounds(feature.geometry);

    if (!bounds) {
      continue;
    }

    minLongitude = Math.min(minLongitude, bounds[0][0]);
    minLatitude = Math.min(minLatitude, bounds[0][1]);
    maxLongitude = Math.max(maxLongitude, bounds[1][0]);
    maxLatitude = Math.max(maxLatitude, bounds[1][1]);
  }

  if (!Number.isFinite(minLongitude)) {
    return null;
  }

  return [
    [minLongitude, minLatitude],
    [maxLongitude, maxLatitude],
  ];
}

/** Dispatch bounds calculation to the correct handler based on geometry type. */
function getAnyGeometryBounds(geometry: Polygon | MultiPolygon | LineString | MultiLineString): LngLatBoundsLike | null {
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    return getFeatureBounds(geometry);
  }

  const coordinates = geometry.type === 'LineString'
    ? geometry.coordinates
    : geometry.coordinates.flat();

  return getBoundsFromPositions(coordinates);
}

/**
 * Flatten all coordinate rings of a Polygon or MultiPolygon and return the bounding box.
 * For Polygon: `coordinates[0]` is the outer ring, `coordinates[1+]` are holes (ignored for bounds).
 * For MultiPolygon: `coordinates.flat(2)` flattens all rings from all polygons.
 */
function getFeatureBounds(geometry: Polygon | MultiPolygon): LngLatBoundsLike | null {
  const coordinates = geometry.type === 'Polygon'
    ? geometry.coordinates.flat()
    : geometry.coordinates.flat(2);

  return getBoundsFromPositions(coordinates);
}

/**
 * Return the approximate center point of a polygon (midpoint of its bounding box).
 * Used to position the lock-icon marker for locked tasks.
 * Returns null if the polygon has no valid coordinates.
 */
function getPolygonCenter(geometry: Polygon): [number, number] | null {
  const bounds = getFeatureBounds(geometry);

  if (!bounds) {
    return null;
  }

  const [[minLongitude, minLatitude], [maxLongitude, maxLatitude]] = bounds;

  return [
    (minLongitude + maxLongitude) / 2,
    (minLatitude + maxLatitude) / 2,
  ];
}

/** Iterate a flat array of [lng, lat] positions and return their bounding box. */
function getBoundsFromPositions(positions: Position[]): LngLatBoundsLike | null {
  if (positions.length === 0) {
    return null;
  }

  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;

  for (const position of positions) {
    const [longitude, latitude] = position;

    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      continue;
    }

    minLongitude = Math.min(minLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }

  if (!Number.isFinite(minLongitude)) {
    return null;
  }

  return [
    [minLongitude, minLatitude],
    [maxLongitude, maxLatitude],
  ];
}

/**
 * Convert a Polygon or MultiPolygon into a LineString/MultiLineString FeatureCollection
 * suitable for the dashed AOI outline layer.
 *
 * We strip rings with fewer than 2 points to avoid MapLibre rendering errors.
 * All rings (outer + holes) are included since the AOI boundary may have holes.
 */
function createOutlineFeatures(geometry: Polygon | MultiPolygon): Array<Feature<LineString | MultiLineString>> {
  if (geometry.type === 'Polygon') {
    const coordinates = geometry.coordinates.filter(ring => ring.length >= 2);

    return coordinates.length > 0
      ? [{
          type: 'Feature',
          geometry: {
            type: 'MultiLineString',
            coordinates,
          },
          properties: {},
        }]
      : [];
  }

  const coordinates = geometry.coordinates
    .map(polygon => polygon.filter(ring => ring.length >= 2))
    .filter(polygon => polygon.length > 0)
    .flat();

  return coordinates.length > 0
    ? [{
        type: 'Feature',
        geometry: {
          type: 'MultiLineString',
          coordinates,
        },
        properties: {},
      }]
      : [];
}

/** Change the cursor to a pointer when hovering over a clickable task polygon. */
function handleTaskMouseEnter() {
  if (!detailMap) {
    return;
  }

  detailMap.getCanvas().style.cursor = 'pointer';
}

/** Reset the cursor when the pointer leaves a task polygon. */
function handleTaskMouseLeave() {
  if (!detailMap) {
    return;
  }

  detailMap.getCanvas().style.cursor = '';
}

/**
 * Emit the clicked task's ID to the parent page.
 * We validate that the feature has a non-empty string `id` property before emitting
 * to avoid passing null/undefined IDs when the user clicks on the map background.
 */
function handleTaskClick(event: MapLayerMouseEvent) {
  const clickedTask = event.features?.[0]?.properties?.id;

  if (typeof clickedTask === 'string' && clickedTask.length > 0) {
    emit('select-task', clickedTask);
  }
}

/**
 * Re-create all lock-icon markers from scratch on every data update.
 * MapLibre Markers are DOM elements and can't be updated in-place efficiently,
 * so we remove all old ones and add new ones whenever the locked task set changes.
 * The marker is a `<button>` (not a `<div>`) so it's keyboard-accessible and announces
 * its purpose to screen readers via `aria-label`.
 */
function syncLockedTaskMarkers() {
  if (!detailMap || !maplibregl) {
    return;
  }

  clearLockedTaskMarkers();

  lockedTaskMarkers = lockedTaskMarkersData.value.map(({ id, center }) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'project-detail-map-lock-marker';
    element.setAttribute('aria-label', 'Locked task');
    element.innerHTML = '<i class="material-icons md-16 md-lock" aria-hidden="true"></i>';
    element.addEventListener('click', () => emit('select-task', id));

    return new maplibregl!.Marker({
      element,
      anchor: 'center',
    })
      .setLngLat(center)
      .addTo(detailMap!);
  });
}

/** Remove all lock-icon Markers from the map and empty the tracking array. */
function clearLockedTaskMarkers() {
  for (const marker of lockedTaskMarkers) {
    marker.remove();
  }

  lockedTaskMarkers = [];
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-detail-map-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

.project-detail-map {
  width: 100%;
  height: 100%;
}

.project-detail-map-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.project-detail-map-legend {
  position: absolute;
  left: 1.35rem;
  bottom: 1.35rem;
  min-width: 16rem;
  padding: 1.15rem 1.1rem 1rem;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 0.8rem;
  box-shadow: 0 0.6rem 1.6rem rgba($text-navy, 0.14);
}

.project-detail-map-legend h2 {
  margin: 0 0 0.8rem;
  color: #1a1e3d;
  font-family: var(--secondary-font-family);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
}

.project-detail-map-legend ul {
  display: grid;
  gap: 0.72rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-detail-map-legend li {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: #4d5373;
  font-size: 1rem;
  line-height: 1.25;
}

.project-detail-map-legend-swatch,
.project-detail-map-legend-lock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
  border: 1px solid rgba(90, 96, 123, 0.14);
}

.project-detail-map-legend-lock {
  color: #d94f4f;
  border-color: rgba(217, 79, 79, 0.22);
  background: rgba(255, 255, 255, 0.94);
}

:deep(.project-detail-map-lock-marker) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  color: #d94f4f;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(217, 79, 79, 0.2);
  border-radius: 999px;
  box-shadow: 0 0.35rem 0.85rem rgba(25, 30, 61, 0.16);
}

:deep(.project-detail-map-lock-marker .material-icons) {
  margin-top: 0;
}

@include media-breakpoint-down(sm) {
  .project-detail-map-legend {
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    min-width: 0;
  }
}
</style>
