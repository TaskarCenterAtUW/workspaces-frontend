<template>
  <div class="feature-image">
    <div class="feature-image__panel">
      <button
        v-show="!minimized"
        class="feature-image__thumb-btn"
        :disabled="error || !loaded"
        :title="error ? undefined : 'Click to enlarge'"
        @click="emit('open')"
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
        <button
          class="feature-image__toggle"
          :title="minimized ? 'Expand' : 'Minimize'"
          @click="minimized = !minimized"
        >
          <app-icon :variant="minimized ? 'add' : 'remove'" />
        </button>
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
  </div>
</template>

<script setup lang="ts">
interface Props {
  imageUrl: string;
}

const props = defineProps<Props>();
const emit = defineEmits(['open']);

const loaded = ref(false);
const error = ref(false);
const minimized = ref(false);

watch(() => props.imageUrl, () => {
  loaded.value = false;
  error.value = false;
  minimized.value = false;
});

function onLoad() {
  loaded.value = true;
}

function onError() {
  error.value = true;
}
</script>

<style scoped lang="scss">
@import "assets/scss/theme.scss";

.feature-image {
  position: absolute;
  bottom: 2rem;
  left: 0.6rem;

  @include media-breakpoint-down(lg) {
    & { display: none; }
  }

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
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.2rem 0.5rem;
    font-size: 0.75em;
  }

  &__toggle {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: $secondary;
    line-height: 1;

    &:hover {
      color: $body-color;
    }

    i {
      margin-top: 0;
    }
  }

  &__link {
    color: $secondary;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
