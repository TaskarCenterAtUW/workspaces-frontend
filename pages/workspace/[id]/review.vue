<template>
  <section
    class="review-page"
    :class="{ 'detail-open': currentItem }"
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
        @resolve="resolveCurrentChangeset"
        @back="currentItem = undefined"
      />
      <review-attribute-diff
        v-if="currentDiff && reviewList.workspace"
        :dataset-type="reviewList.workspace.type"
        :diff="currentDiff"
        :image-url="currentImageUrl"
        @open-photo="showLightbox = true"
      />
      <review-feature-image
        v-if="currentImageUrl"
        :image-url="currentImageUrl"
        @open="showLightbox = true"
      />
      <b-modal
        v-if="currentImageUrl"
        v-model="showLightbox"
        size="xl"
        centered
        no-header
        no-footer
        body-class="p-0 lightbox-body"
      >
        <button
          class="lightbox-close"
          aria-label="Close"
          @click="showLightbox = false"
        >
          <app-icon
            variant="close"
            no-margin
          />
        </button>
        <img
          :src="currentImageUrl"
          style="width: 100%; height: auto; display: block"
          alt="Photo submitted with the quest"
        >
      </b-modal>
    </section>
  </section>
</template>

<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { toast } from 'vue3-toastify';

import { reviewManager, workspacesClient } from '~/services/index';
import { kartaViewImageUrl, convertKartaViewUrl } from '~/util/kartaview';

import type ReviewMap from '~/components/review/Map.vue';
import type { ReviewListItem } from '~/services/review.ts';
import type { AdiffAction } from '~/types/adiff';
import type { OsmChangeset } from '~/types/osm';

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
const showLightbox = ref(false);

const currentImageUrl = computed(() => {
  const raw = kartaViewImageUrl(currentDiff.value?.new?.tags)
    ?? kartaViewImageUrl(currentDiff.value?.old?.tags);
  return raw ? convertKartaViewUrl(raw) : undefined;
});

refresh();

watch(currentItem, () => {
  currentDiff.value = undefined;
});

watch(currentDiff, () => {
  showLightbox.value = false;
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

async function resolveCurrentChangeset() {
  if (!currentItem.value?.isChangeset) {
    return;
  }

  const changesetId = currentItem.value.id;

  try {
    await workspacesClient.resolveChangeset(workspaceId, changesetId);

    const changeset = currentItem.value.data as OsmChangeset;
    delete changeset.tags.review_requested;
    changeset.tags.reviewed_by = String(changesetId);

    toast.success('Changeset marked as reviewed.');

    await refresh();
  }
  catch {
    toast.error('Failed to resolve changeset.');
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
@import "assets/scss/theme.scss";

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

  @include media-breakpoint-down(md) {
    & {
      .map-container { display: none; }
    }

    &.detail-open {
      .review-sidebar { display: none; }
      .map-container { display: block; }
    }
  }
}

.lightbox-body {
  position: relative;
}

.lightbox-close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;

  &:hover {
    background: rgba(0, 0, 0, 0.75);
  }
}
</style>
