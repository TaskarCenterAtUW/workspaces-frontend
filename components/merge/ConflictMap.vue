<template>
  <div
    ref="mapContainer"
    class="conflict-map"
  >
    <div class="conflict-map-legend">
      <span><i class="legend-swatch legend-a" />A</span>
      <span><i class="legend-swatch legend-b" />B</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getGeoJsonBounds } from '~/util/geojson';
import { bingImageryStyle } from '~/util/map-style';
import { OsmElementLookup, wayToGeoJsonCoords } from '~/util/osm';

import type { FeatureCollection } from 'geojson';
import type maplibregl from 'maplibre-gl';

import type { MergeConflict } from '~/services/merge';
import type { OsmElement } from '~/types/osm';

const COLOR_A = '#dc3545';
const COLOR_B = '#0d6efd';

const EMPTY_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: []
};

interface Props {
  conflict?: MergeConflict;
  lookup: OsmElementLookup;

  /**
   * Consulted for anything `lookup` does not hold. The merged set excludes
   * conflicted elements and everything an uncontested deletion removed, so for
   * a delete-versus-edit way conflict neither side's vertices are in it and
   * the map would otherwise be blank for the very conflict being judged.
   */
  fallback?: OsmElementLookup;
}

const props = defineProps<Props>();
defineExpose({ getLatLonZoom });

const geometry = computed(() => {
  if (!props.fallback) {
    return props.lookup;
  }

  // The merged set wins where it has an element; the ancestor fills the gaps.
  //
  const combined = new OsmElementLookup(props.fallback);

  for (const element of props.lookup) {
    combined.insert(element);
  }

  return combined;
});

const mapContainer = useTemplateRef<HTMLDivElement>('mapContainer');

let map: maplibregl.Map | undefined;
let positioned = false;
let resizeObserver: ResizeObserver | undefined;
let disposed = false;

// Set once the style is in place and the sources exist. `map.loaded()` cannot
// serve here: it also reports false while sources are dirty or tiles are in
// flight, which is exactly the state right after drawing a conflict, so a
// second selection would be dropped and the map would keep showing the first.
//
let styleReady = false;
let pendingConflict: MergeConflict | undefined;

onMounted(async () => {
  // Imported on mount so maplibre-gl stays out of the critical bundle for
  // pages that never show a map:
  //
  const maplibre = await import('maplibre-gl');

  // The component can unmount while that import is in flight, which would
  // otherwise build a map against a detached container and never dispose it:
  //
  if (disposed || !mapContainer.value) {
    return;
  }

  map = new maplibre.Map({
    container: mapContainer.value,
    style: bingImageryStyle()
  });

  map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

  // The conflicts page is a flex layout whose map pane resizes as the detail
  // table below it grows, and MapLibre does not notice on its own:
  //
  resizeObserver = new ResizeObserver(() => map?.resize());
  resizeObserver.observe(mapContainer.value);

  map.on('load', () => {
    initSources();
    styleReady = true;

    const conflict = pendingConflict ?? props.conflict;
    pendingConflict = undefined;

    if (conflict) {
      drawConflict(conflict);
    }
  });
});

onUnmounted(() => {
  disposed = true;
  resizeObserver?.disconnect();
  map?.remove();

  // Cleared as well as removed, so the guards that check `map` cannot read a
  // map that no longer exists:
  //
  map = undefined;
});

watch(() => props.conflict, (conflict) => {
  // Selections made before the style loads are held rather than dropped:
  //
  if (!styleReady) {
    pendingConflict = conflict;
    return;
  }

  if (conflict) {
    drawConflict(conflict);
  } else {
    clearLayers();
  }
});

/**
 * The map's current centre, or undefined when it has none to report.
 *
 * `map` is unset while the dynamic import is in flight, and stays unset
 * without WebGL. `positioned` matters as much: the map is built without a
 * centre, so until `fitBounds` runs it sits at 0/0 zoom 0, and `drawConflict`
 * returns early whenever a conflict yields no drawable geometry. Reporting
 * either state as a real position sends the editor to 0/0.
 */
function getLatLonZoom() {
  if (!map || !positioned) {
    return undefined;
  }

  const { lng, lat } = map.getCenter();

  return { lat, lon: lng, zoom: map.getZoom() };
}

function initSources() {
  if (!map) {
    return;
  }

  for (const [side, color] of [['a', COLOR_A], ['b', COLOR_B]] as const) {
    map.addSource(`conflict-${side}`, {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    map.addLayer({
      id: `conflict-${side}-line`,
      type: 'line',
      source: `conflict-${side}`,
      filter: ['==', '$type', 'LineString'],
      paint: {
        'line-color': color,
        'line-width': 3
      }
    });

    map.addLayer({
      id: `conflict-${side}-circle`,
      type: 'circle',
      source: `conflict-${side}`,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-color': color,
        'circle-radius': 8,
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2
      }
    });
  }
}

function setSourceData(side: 'a' | 'b', collection: FeatureCollection) {
  const source = map?.getSource(`conflict-${side}`) as maplibregl.GeoJSONSource | undefined;
  source?.setData(collection);
}

function clearLayers() {
  setSourceData('a', EMPTY_COLLECTION);
  setSourceData('b', EMPTY_COLLECTION);
}

function drawConflict(conflict: MergeConflict) {
  const aCollection = buildFeatureCollection(conflict.a);
  const bCollection = buildFeatureCollection(conflict.b);

  setSourceData('a', aCollection);
  setSourceData('b', bCollection);

  const bounds = getGeoJsonBounds({
    type: 'FeatureCollection',
    features: [...aCollection.features, ...bCollection.features]
  });

  if (!bounds || !map) {
    return;
  }

  // The first fit jumps rather than animates: it starts from 0/0 zoom 0, and
  // `getLatLonZoom` would report the frames in between, out over the Atlantic.
  // Later fits move between two real places, so their frames stay near the data.
  //
  map.fitBounds(bounds, { padding: 80, maxZoom: 18, animate: positioned });
  positioned = true;
}

function buildFeatureCollection(element: OsmElement): FeatureCollection {
  if (element.type === 'node') {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [element.lon, element.lat] },
        properties: { }
      }]
    };
  }

  if (element.type === 'way') {
    const coords = wayToGeoJsonCoords(element, geometry.value);

    // `undefined` means a referenced node is missing, so the line would be
    // drawn as a shortcut past it. Better to draw nothing than a wrong shape:
    //
    if (!coords || coords.length < 2) {
      return EMPTY_COLLECTION;
    }

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { }
      }]
    };
  }

  const features: FeatureCollection['features'] = [];

  for (const member of element.members) {
    const memberElement = geometry.value.get(member.type, member.ref);

    // Nested relations are left undrawn rather than walked: relation
    // membership can be cyclic, and this recurses:
    //
    if (!memberElement || memberElement.type === 'relation') {
      continue;
    }

    features.push(...buildFeatureCollection(memberElement).features);
  }

  return { type: 'FeatureCollection', features };
}
</script>

<style scoped lang="scss">
.conflict-map {
  position: relative;
  width: 100%;
  height: 100%;

  .conflict-map-legend {
    position: absolute;
    bottom: 0.5rem;
    left: 0.5rem;
    z-index: 1;
    display: flex;
    gap: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    background-color: rgba(255, 255, 255, 0.85);
    font-size: 0.75rem;

    span {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  }

  .legend-swatch {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
  }

  .legend-a {
    background-color: #dc3545;
  }

  .legend-b {
    background-color: #0d6efd;
  }
}
</style>
