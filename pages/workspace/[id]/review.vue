// Test outline
// @test e2e: loading this page shows a sidebar with a list of items to review (playwright snapshot this)
// @test e2e: clicking on an item in the sidebar shows its details in the map and its attribute differences in a panel on the right (playwright snapshot this)
// @test e2e: clicking the "edit" button in the review overlay opens the editor centered on the item (playwright snapshot this and assert() the URL has the proper hash for the map view)
// @test e2e: while the data is loading on the map a spinner appears (assert() this is true)
// @test e2e: the "gear" menu allows filtering of the elements in the sidebar--make sure the simulated response and the display on the UI matches (playright snapshot or assert() this)
// @test e2e: clicking the "refresh" button in the sidebar refreshes the data in the sidebar and on the map (playwright snapshot this)
// @test e2e: check that both changeset entries and feedback entries display in the sidebar, and that clicking on each shows the proper details in the map and attribute diff panel (playwright snapshot this)
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)

<template>
  <section
    class="review-page"
    fluid
  >
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
        <div
          v-show="loadingMap"
          class="map-loading-overlay"
        >
          <app-spinner size="lg" />
        </div>
      </transition>
      <transition name="fade">
        <div
          v-show="!currentItem"
          class="review-notice"
        >
          <!-- TODO: add some content/help here -->
        </div>
      </transition>

      <review-overlay
        v-if="currentItem"
        :item="currentItem"
        @edit="openEditor"
      />
      <review-attribute-diff
        v-if="currentDiff && reviewList.workspace"
        :dataset-type="reviewList.workspace.type"
        :diff="currentDiff"
      />
    </section>
  </section>
</template>

<script setup lang="ts">
import { reviewManager, workspacesClient } from '~/services/index';

import type ReviewMap from '~/components/review/Map.vue';
import type { ReviewListItem } from '~/services/review.ts';
import type { AdiffAction } from '~/types/adiff';

const route = useRoute();
const workspaceId = Number(route.params.id);

const workspace = await workspacesClient.getWorkspace(workspaceId);
provide('workspace', workspace);

const reviewList = reviewManager.getList(workspaceId);
const filter = reactive(reviewManager.getFilter());

const map = useTemplateRef<InstanceType<typeof ReviewMap>>('map');

const loading = ref(false);
const loadingMap = ref(false);
const currentItem = ref<ReviewListItem | undefined>();
const currentDiff = ref<AdiffAction | undefined>();

refresh();

watch(currentItem, () => {
  currentDiff.value = undefined;
});

async function refresh() {
  if (loading.value) {
    return;
  }

  loading.value = true;

  try {
    await reviewList.refresh(filter);
  }
  finally {
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
    hash: `#map=${zoom}/${lat}/${lon}`,
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
