<template>
  <section class="review-overlay">
    <review-toolbar
      v-model:show-details="showDetails"
      v-model:show-discussion="showDiscussion"
      :item="item"
      @edit="props.onEdit"
    />

    <div class="review-overlay-panels">
      <review-details
        v-if="showDetails"
        :item="item"
      />
      <review-discussion
        v-if="showDiscussion"
        :item="item"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ReviewListItem } from '~/services/review';

interface Props {
  item: ReviewListItem;
  onEdit: () => void;
}

const props = defineProps<Props>();

const showDetails = ref(false);
const showDiscussion = ref(false);

watch(() => props.item, () => {
  showDetails.value = false;
  showDiscussion.value = false;
});
</script>

<style lang="scss">
@import "assets/scss/theme.scss";

.review-overlay {
  position: absolute;
  top: 1rem;
  left: 1rem;
  margin-right: 1rem;

  .review-overlay-panels {
    max-height: calc(100vh - $navbar-height - 6rem);
    overflow: auto;
    box-shadow: var(--bs-box-shadow);

    & > :not(:last-child) {
      margin-bottom: 0.5rem;
    }
  }
}
</style>
