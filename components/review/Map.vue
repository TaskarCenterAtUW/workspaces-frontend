<template>
  <div
    ref="map"
    class="review-map"
  />
</template>

<script lang="ts">
import type { StyleSpecification } from 'maplibre-gl';
</script>

<script setup lang="ts">
import maplibregl from 'maplibre-gl';
import { MapLibreAugmentedDiffViewer } from '@osmcha/maplibre-adiff-viewer';

import { changesetManager } from '~/services/index';
import type { ReviewListItem } from '~/services/review';

import type { AdiffAction } from '~/types/adiff';
import type { OsmChangeset, OsmNote } from '~/types/osm';
import type { TdeiFeedback } from '~/types/tdei';
// import { OPENFREEMAP_STYLE_URL } from '~/util/map-style';
// const reviewMapStyle = OPENFREEMAP_STYLE_URL;

const reviewMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    bing: {
      type: 'raster',
      scheme: 'xyz',
      tiles: [
        'https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=587&mkt=en-gb&n=z',
        'https://ecn.t1.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=587&mkt=en-gb&n=z',
        'https://ecn.t2.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=587&mkt=en-gb&n=z',
        'https://ecn.t3.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=587&mkt=en-gb&n=z',
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: 'Imagery © Microsoft Corporation',
    },
  },
  layers: [
    {
      id: 'imagery',
      type: 'raster',
      source: 'bing',
    },
  ],
};

interface Props {
  workspaceId: number;
  item?: ReviewListItem;
}

const props = defineProps<Props>();

defineExpose({ getLatLonZoom });

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
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  reviewMap?.remove();
});

watch(() => props.item, drawItem);

function initMap() {
  if (reviewMap) {
    reviewMap.remove();
  }

  if (mapRef.value) {
    reviewMap = new maplibregl.Map({
      container: mapRef.value,
      style: reviewMapStyle,
    });

    resizeObserver = new ResizeObserver(() => reviewMap?.resize());
    resizeObserver.observe(mapRef.value);
  }
}

function resetMap() {
  reviewMap.setStyle(reviewMapStyle);

  if (popup) {
    popup.remove();
  }
}

function getLatLonZoom() {
  const { lng, lat } = reviewMap.getCenter();
  const zoom = reviewMap.getZoom();

  return { lat, lon: lng, zoom };
}

let drawGeneration = 0;

async function drawItem(item: ReviewListItem | undefined) {
  emptyChangeset.value = false;
  mapError.value = null;
  const generation = ++drawGeneration;
  if (!item) {
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    if (item.isChangeset) {
      if (item.loadingChangeset) {
        await item.oscPromise;
      }

      await drawChangeset(item.data as OsmChangeset, generation);
    }
    else if (item.isFeedback) {
      if (generation === drawGeneration) drawFeedback(item.data as TdeiFeedback);
    }
    else if (item.isNote) {
      if (generation === drawGeneration) drawNote(item.data as OsmNote);
    }
  }
  catch {
    // Discard result if the user already selected a different changeset.
    if (generation === drawGeneration) {
      mapError.value = 'Could not load changeset data. The server may be unavailable or took too long to respond. Try again or select a different changeset.';
    }
  }
  finally {
    if (generation === drawGeneration) {
      loading.value = false;
    }
  }
}

async function drawChangeset(changeset: OsmChangeset, generation: number) {
  const adiff = await changesetManager.getAdiff(props.workspaceId, changeset);

  // Discard result if the user already selected a different changeset.
  if (generation !== drawGeneration) {
    return;
  }

  resetMap();
  const hasChanges = adiff.actions.some(action =>
    action.type === 'create'
    || action.type === 'modify'
    || action.type === 'delete'
  );
  if (!hasChanges) {
    emptyChangeset.value = true;
    return;
  }

  adiffViewer = new MapLibreAugmentedDiffViewer(adiff, {
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

function drawFeedback(feedback: TdeiFeedback) {
  resetMap();

  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    .setLngLat([feedback.location_longitude, feedback.location_latitude])
    .setText(feedback.feedback_text)
    .addTo(reviewMap);

  reviewMap.jumpTo({
    center: [feedback.location_longitude, feedback.location_latitude],
    zoom: 18,
  });
}

function drawNote(note: OsmNote) {
  resetMap();

  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    .setLngLat([note.lon, note.lat])
    .setText(note.comments[0]?.text ?? '(empty)')
    .addTo(reviewMap);

  reviewMap.jumpTo({
    center: [note.lon, note.lat],
    zoom: 18,
  });
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
