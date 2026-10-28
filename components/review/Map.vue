<template>
  <div
    ref="map"
    class="review-map"
  />
</template>

<script setup lang="ts">
import * as maplibregl from 'maplibre-gl';
import { MapLibreAugmentedDiffViewer } from '@osmcha/maplibre-adiff-viewer';

import { changesetManager, osmClient } from '~/services/index';
import { prepareAdiffForMap } from '~/util/adiff';
import { elementGeoJson } from '~/util/osm';
import { bingImageryStyle } from '~/util/map-style';
import type { ReviewListItem } from '~/services/review';

import type { AdiffAction } from '~/types/adiff';
import type { OsmChangeset, OsmFixme, OsmNote } from '~/types/osm';
import type { TdeiFeedback } from '~/types/tdei';

interface Props {
  workspaceId: number;
  item?: ReviewListItem;
}

const props = defineProps<Props>();

defineExpose({ getLatLonZoom, retry });

const loading = defineModel<boolean>('loading');
const currentDiff = defineModel<AdiffAction>('currentDiff');
const mapRef = useTemplateRef<HTMLDivElement>('map');

let reviewMap: maplibregl.Map;
let adiffViewer: typeof MapLibreAugmentedDiffViewer;
let popup: maplibregl.Popup;
let resizeObserver: ResizeObserver | undefined;
const emptyChangeset = defineModel<boolean>('emptyChangeset', {
  default: false
});
const mapError = defineModel<string | null>('mapError', {
  default: null
});

onMounted(() => {
  initMap();
  void drawItem(props.item);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  reviewMap?.remove();
});

watch(() => props.item, item => void drawItem(item));

function initMap() {
  if (reviewMap) {
    reviewMap.remove();
  }

  if (mapRef.value) {
    reviewMap = new maplibregl.Map({
      container: mapRef.value,
      style: bingImageryStyle(),
    });

    resizeObserver = new ResizeObserver(() => reviewMap?.resize());
    resizeObserver.observe(mapRef.value);
  }
}

async function resetMap(): Promise<void> {
  popup?.remove();

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reviewMap.off('style.load', onStyleLoaded);
      reject(new Error('Timed out loading the review map style.'));
    }, 15000);

    function onStyleLoaded() {
      window.clearTimeout(timeoutId);
      resolve();
    }
    reviewMap.once('style.load', onStyleLoaded);

    try {
      reviewMap.setStyle(bingImageryStyle(), { diff: false });
    }
    catch (error) {
      window.clearTimeout(timeoutId);
      reviewMap.off('style.load', onStyleLoaded);
      reject(error);
    }
  });
}

function getLatLonZoom() {
  const { lng, lat } = reviewMap.getCenter();
  const zoom = reviewMap.getZoom();

  return { lat, lon: lng, zoom };
}

let drawGeneration = 0;

async function drawItem(item: ReviewListItem | undefined, refreshAdiff: boolean = false) {
  emptyChangeset.value = false;
  mapError.value = null;
  const generation = ++drawGeneration;
  if (!item) {
    await resetMap();
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    if (item.isChangeset) {
      if (item.loadingChangeset) {
        await item.oscPromise;
      }

      await drawChangeset(item.data as OsmChangeset, generation, refreshAdiff);
    }
    else if (item.isFeedback) {
      await drawFeedback(item.data as TdeiFeedback, generation);
    }
    else if (item.isNote) {
      await drawNote(item.data as OsmNote, generation);
    }
    else if (item.isFixme) {
      await drawFixme(item.data as OsmFixme, generation);
    }
  }
  catch (error: unknown) {
    // Discard result if the user already selected a different changeset.
    if (generation === drawGeneration) {
      mapError.value = 'Could not display changeset data. Try again or select a different changeset.';
      console.error('Could not display changeset data on the review map.', error);
    }
  }
  finally {
    if (generation === drawGeneration) {
      loading.value = false;
    }
  }
}

async function retry(): Promise<void> {
  // A retry asks the API for a fresh diff instead of reusing the cached copy.
  await drawItem(props.item, true);
}

async function drawChangeset(
  changeset: OsmChangeset,
  generation: number,
  refreshAdiff: boolean,
) {
  const adiff = await changesetManager.getAdiff(props.workspaceId, changeset, refreshAdiff);

  // Discard result if the user already selected a different changeset.
  if (generation !== drawGeneration) {
    return;
  }

  await resetMap();

  if (generation !== drawGeneration) {
    return;
  }

  const hasChanges = adiff.actions.some(action =>
    action.type === 'create'
    || action.type === 'modify'
    || action.type === 'delete'
  );
  if (!hasChanges) {
    emptyChangeset.value = true;
    return;
  }

  adiffViewer = new MapLibreAugmentedDiffViewer(prepareAdiffForMap(adiff), {
    onClick: onAdiffClick,
    showElements: ['node', 'way', 'relation'],
    showActions: ['create', 'modify', 'delete', 'noop'],
  });

  adiffViewer.addTo(reviewMap);

  const czb = reviewMap.cameraForBounds(adiffViewer.bounds(), {
    padding: 200,
    maxZoom: 18,
  });

  if (czb) {
    reviewMap.jumpTo(czb);
  }
}

async function drawFeedback(feedback: TdeiFeedback, generation: number) {
  await resetMap();

  if (generation !== drawGeneration) {
    return;
  }

  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    .setLngLat([feedback.location_longitude, feedback.location_latitude])
    .setText(feedback.feedback_text)
    .addTo(reviewMap);

  reviewMap.jumpTo({
    center: [feedback.location_longitude, feedback.location_latitude],
    zoom: 18,
  });
}

async function drawNote(note: OsmNote, generation: number) {
  await resetMap();

  if (generation !== drawGeneration) {
    return;
  }

  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    .setLngLat([note.lon, note.lat])
    .setText(note.comments[0]?.text ?? '(empty)')
    .addTo(reviewMap);

  reviewMap.jumpTo({
    center: [note.lon, note.lat],
    zoom: 18,
  });
}

/**
 * How the element a fixme is on is drawn: like a selected element in a
 * changeset (the adiff viewer's casing under a core line or dot), in red.
 */
const FIXME_ELEMENT_STYLE = {
  color: '#ff3d00',
  casingColor: 'hsla(0, 0%, 45%, 0.5)'
};

/**
 * Draws the element a fixme is on (a node's point, a way's line or outline, a
 * relation's members), styled like a selected changeset element, and shows the
 * fixme's note on it. If the element can't
 * be loaded, the note is still shown at the fixme's location.
 */
async function drawFixme(fixme: OsmFixme, generation: number) {
  await resetMap();

  if (generation !== drawGeneration) {
    return;
  }

  let geometry: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  try {
    geometry = elementGeoJson(fixme.type, fixme.id, await osmClient.getElementFull(props.workspaceId, fixme.type, fixme.id));
  }
  catch (error: unknown) {
    console.warn(`Could not load ${fixme.type} ${fixme.id} to draw it.`, error);
  }

  if (generation !== drawGeneration) {
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  for (const feature of geometry.features) {
    const geom = feature.geometry;
    const points = geom.type === 'Point'
      ? [geom.coordinates]
      : geom.type === 'LineString'
        ? geom.coordinates
        : geom.type === 'Polygon' ? geom.coordinates.flat() : [];
    for (const [lon, lat] of points as [number, number][]) bounds.extend([lon, lat]);
  }

  if (geometry.features.length) {
    reviewMap.addSource('fixme-element', { type: 'geojson', data: geometry });
    const lines = ['!=', ['geometry-type'], 'Point'] as maplibregl.FilterSpecification;
    const points = ['==', ['geometry-type'], 'Point'] as maplibregl.FilterSpecification;
    reviewMap.addLayer({
      id: 'fixme-element-line-casing',
      type: 'line',
      source: 'fixme-element',
      filter: lines,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-width': 8, 'line-color': FIXME_ELEMENT_STYLE.casingColor, 'line-blur': 2 }
    });
    reviewMap.addLayer({
      id: 'fixme-element-node-casing',
      type: 'circle',
      source: 'fixme-element',
      filter: points,
      paint: { 'circle-radius': 8, 'circle-color': FIXME_ELEMENT_STYLE.casingColor }
    });
    reviewMap.addLayer({
      id: 'fixme-element-line',
      type: 'line',
      source: 'fixme-element',
      filter: lines,
      paint: { 'line-width': 2, 'line-color': FIXME_ELEMENT_STYLE.color }
    });
    reviewMap.addLayer({
      id: 'fixme-element-node',
      type: 'circle',
      source: 'fixme-element',
      filter: points,
      paint: { 'circle-radius': 4, 'circle-color': FIXME_ELEMENT_STYLE.color }
    });
  }

  // The note goes at the fixme's location, or the middle of what was drawn.
  const at: [number, number] | undefined = fixme.lat !== null && fixme.lon !== null
    ? [fixme.lon, fixme.lat]
    : bounds.isEmpty() ? undefined : bounds.getCenter().toArray() as [number, number];
  if (!at) {
    mapError.value = `This ${fixme.type} has no location to show on the map. Open it in the editor to see it.`;
    return;
  }

  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    .setLngLat(at)
    .setText(fixme.note)
    .addTo(reviewMap);

  if (bounds.isEmpty() || geometry.features.every(feature => feature.geometry.type === 'Point')) {
    reviewMap.jumpTo({ center: at, zoom: 19 });
  }
  else {
    reviewMap.fitBounds(bounds, { padding: 80, maxZoom: 20, duration: 0 });
  }
}

function onAdiffClick(_event: object, action: AdiffAction) {
  if (action) {
    const element = action.new ?? action.old;
    adiffViewer.select(element.type, element.id);
    currentDiff.value = action;
  }
  else {
    currentDiff.value = undefined;
    adiffViewer.deselect();
  }
}
</script>

<style lang="scss">
.review-map {
  width: 100%;
  height: 100%;
}
</style>
