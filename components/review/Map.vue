<template>
  <div ref="map" class="review-map" />
</template>

<script lang="ts">
import type { StyleSpecification } from 'maplibre-gl';
// const reviewMapStyle = {
//   'version': 8,
//  'sources': {
//     'osm': {
//      'type': 'raster',
//      'tiles': ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
//      'tileSize': 256,
//       'attribution': '&copy; OpenStreetMap Contributors',
//       'maxzoom': 19
//     }
//   },
//   'layers': [
//     {
//       'id': 'osm',
//       'type': 'raster',
//       'source': 'osm'
//     }
//   ]
// };

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
        'https://ecn.t3.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=587&mkt=en-gb&n=z'
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: 'Imagery © Microsoft Corporation'
    }
  },
  layers: [
    {
      id: 'imagery',
      type: 'raster',
      source: 'bing'
    }
  ]
};
</script>

<script setup lang="ts">
import maplibregl from 'maplibre-gl';
import { MapLibreAugmentedDiffViewer } from '@osmcha/maplibre-adiff-viewer';

import { changesetManager } from '~/services/index';
import { ReviewListItem } from '~/services/review';

import type { AdiffAction } from '~/types/adiff';
import type { OsmChangeset, OsmNote } from '~/types/osm';
import type { TdeiFeedback } from '~/types/tdei';

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

onMounted(() => { initMap(); });
watch(() => props.item, drawItem);

function initMap() {
  if (reviewMap) {
    reviewMap.remove();
  }

  if (mapRef.value) {
    reviewMap = new maplibregl.Map({
      container: mapRef.value,
      style: reviewMapStyle
    });
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

async function drawItem(item: ReviewListItem | undefined) {
  if (!item) {
    return;
  }

  loading.value = true;

  if (item.isChangeset) {
    if (item.loadingChangeset) {
      await item.oscPromise;
    }

    await drawChangeset(item.data as OsmChangeset);
  } else if (item.isFeedback) {
    drawFeedback(item.data as TdeiFeedback);
  } else if (item.isNote) {
    drawNote(item.data as OsmNote);
  }

  loading.value = false;
}

async function drawChangeset(changeset: OsmChangeset) {
  const adiff = await changesetManager.getAdiff(props.workspaceId, changeset);
  resetMap();

  adiffViewer = new MapLibreAugmentedDiffViewer(adiff, {
    onClick: onAdiffClick,
    showElements: ['node', 'way', 'relation'],
    showActions: ['create', 'modify', 'delete', 'noop']
  });

  adiffViewer.addTo(reviewMap)

  const czb = reviewMap.cameraForBounds(adiffViewer.bounds(), {
    padding: 200,
    maxZoom: 18
  });

  if (czb) {
    reviewMap.jumpTo(czb);
  }
}

function drawFeedback(feedback: TdeiFeedback) {
  resetMap();

  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    .setLngLat([ feedback.location_longitude, feedback.location_latitude ])
    .setText(feedback.feedback_text)
    .addTo(reviewMap);

  reviewMap.jumpTo({
    center: [ feedback.location_longitude, feedback.location_latitude ],
    zoom: 18
  });
}

function drawNote(note: OsmNote) {
  resetMap();

  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    .setLngLat([ note.lon, note.lat ])
    .setText(note.comments[0]?.text ?? '(empty)')
    .addTo(reviewMap);

  reviewMap.jumpTo({
    center: [ note.lon, note.lat ],
    zoom: 18
  });
}

function onAdiffClick(_event: any, action: AdiffAction) {
  if (action) {
    const element = action.new ?? action.old;
    adiffViewer.select(element.type, element.id);
    currentDiff.value = action;
  } else {
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
