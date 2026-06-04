<template>
  <div class="feature-image">
    <!-- Thumbnail panel -->
    <div class="feature-image__panel">
      <button
        class="feature-image__thumb-btn"
        :disabled="error || !loaded"
        :title="error ? undefined : 'Click to enlarge'"
        @click="openLightbox"
      >
        <app-spinner v-if="!loaded && !error" />
        <img
          v-show="loaded && !error"
          :src="props.imageUrl"
          class="feature-image__thumb"
          alt="Photo submitted with the quest"
          @load="onLoad"
          @error="onError"
        >

        <span
          v-if="error"
          class="feature-image__error"
        >
          <app-icon variant="broken_image" />
          Image unavailable
        </span>
      </button>

      <div class="feature-image__caption">
        <a
          :href="props.imageUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="feature-image__link"
        >
          KartaView
          <app-icon variant="open_in_new" />
        </a>
      </div>
    </div>

    <!-- Lightbox modal -->
    <b-modal
      v-model="showLightbox"
      title="KartaView image"
      size="xl"
      centered
      ok-only
      ok-title="Close"
      ok-variant="secondary"
      body-class="p-1"
    >
      <img
        :src="lightboxSrc"
        class="feature-image__full"
        alt="Photo submitted with the quest"
        @error="onLightboxError"
      >
    </b-modal>
  </div>
</template>

<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { kartaViewFullResUrl } from '~/util/kartaview';

interface Props {
  imageUrl: string;
}

const props = defineProps<Props>();

const loaded = ref(false);
const error = ref(false);
const showLightbox = ref(false);
const lightboxSrc = ref('');

watch(() => props.imageUrl, () => {
  loaded.value = false;
  error.value = false;
  showLightbox.value = false;
  lightboxSrc.value = '';
});

function onLoad() {
  loaded.value = true;
}

function onError() {
  error.value = true;
}

function openLightbox() {
  lightboxSrc.value = kartaViewFullResUrl(props.imageUrl);
  showLightbox.value = true;
}

function onLightboxError() {
  // Full-res URL failed — fall back to the working thumbnail URL
  if (lightboxSrc.value !== props.imageUrl) {
    lightboxSrc.value = props.imageUrl;
  }
}
</script>

<style scoped lang="scss">
@import "assets/scss/theme.scss";

.feature-image {
  position: absolute;
  bottom: 2rem;
  left: 0.6rem;

  &__panel {
    background: $body-bg;
    box-shadow: $box-shadow;
    border-radius: $border-radius;
    overflow: hidden;
  }

  &__thumb-btn {
    display: block;
    width: 10rem;
    min-height: 4rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    line-height: 0;

    &:disabled {
      cursor: default;
    }
  }

  &__thumb {
    width: 100%;
    height: auto;
    display: block;
  }

  &__spinner,
  &__error {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 4rem;
    padding: 0.5rem;
    gap: 0.25rem;
    font-size: 0.8em;
    color: $secondary;
    line-height: 1.2;
  }

  &__caption {
    padding: 0.2rem 0.5rem;
    text-align: right;
    font-size: 0.75em;
  }

  &__link {
    color: $secondary;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  &__full {
    width: 100%;
    height: auto;
    display: block;
  }
}
</style>
