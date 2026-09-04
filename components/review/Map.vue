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
import { prepareAdiffForMap } from '~/util/adiff';
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
      style: reviewMapStyle,
    });

    resizeObserver = new ResizeObserver(() => reviewMap?.resize());
    resizeObserver.observe(mapRef.value);
  }
}

async function resetMap(): Promise<void> {
  if (popup) {
    popup.remove();
  }

  reviewMap.setStyle(reviewMapStyle);

  if (!reviewMap.isStyleLoaded()) {
    // Sources and layers can only be added after MapLibre finishes resetting.
    await new Promise<void>((resolve) => {
      reviewMap.once('style.load', () => resolve());
    });
  }
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
