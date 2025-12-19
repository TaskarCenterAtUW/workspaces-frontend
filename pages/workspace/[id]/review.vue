<template>
  <section class="review-page" fluid>
    <review-sidebar
      v-model:item="currentItem"
      v-model:filter="filter"
      :review-list="reviewList"
      :loading="loading"
      @refresh="refresh"
    />

    <section class="map-container">
      <review-map
        ref="map"
        v-model:loading="loadingMap"
        v-model:current-diff="currentDiff"
        :workspace-id="workspaceId"
        :item="currentItem"
      />

      <transition name="fade">
        <div v-show="loadingMap" class="map-loading-overlay">
          <app-spinner size="lg" />
        </div>
      </transition>
      <transition name="fade">
        <div v-show="!currentItem" class="review-notice">
          <!-- TODO: add some content/help here -->
        </div>
      </transition>

      <review-overlay v-if="currentItem" :item="currentItem" @edit="openEditor" />
      <review-attribute-diff
        v-if="currentDiff && reviewList.workspace"
        :dataset-type="reviewList.workspace.type"
        :diff="currentDiff"
      />
    </section>
  </section>
</template>

<script setup lang="ts">
import { reviewManager } from '~/services/index';

import type ReviewMap from '~/components/review/Map.vue';
import type { ReviewListItem } from '~/services/review.ts';
import type { AdiffAction } from '~/types/adiff';

const route = useRoute();
const workspaceId = Number(route.params.id);

const reviewList = reviewManager.getList(workspaceId);
const filter = reactive(reviewManager.getFilter());

const map = useTemplateRef<InstanceType<typeof ReviewMap>>('map');

const loading = ref(false);
const loadingMap = ref(false);
const currentItem = ref<ReviewListItem | undefined>();
const currentDiff = ref<AdiffAction | undefined>();

refresh();

watch(currentItem, () => { currentDiff.value = undefined });

async function refresh() {
  if (loading.value) {
    return;
  }

  loading.value = true;

  try {
    await reviewList.refresh(filter);
  } finally {
    loading.value = false;
  }
}

async function openEditor() {
  if (!map.value) {
    return;
  }

  const { lat, lon, zoom } = map.value.getLatLonZoom();

  await navigateTo({
    path: `/workspace/${workspaceId}/edit`,
    query: { datatype: reviewList.workspace?.type },
    hash: `#map=${zoom}/${lat}/${lon}`
  });
}
</script>

<style lang="scss">
.review-page {
  display: flex;
  height: 100%;

  .map-container {
    position: relative;
    background-color: #AAAAAA;
    flex: 1 1 75%;
    height: 100%;
  }

  .review-notice,
  .map-loading-overlay,
  .map-loading-overlay .spinner-border {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    margin: auto;
    background-color: #AAAAAA;
  }

  .review-notice {
    background-color: var(--bs-body-bg);
  }
}
</style>
