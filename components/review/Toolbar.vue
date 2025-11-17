<template>
  <nav class="review-toolbar">
    <span class="border-end pe-3 me-3 text-uppercase ">
      <span class="fw-bold">{{ props.item.displayType }}:</span>
      #{{ props.item.id }}
    </span>
    <button class="btn btn-sm btn-dark" @click="edit">
      <app-icon variant="edit_location_alt" no-margin />
      <span class="d-none d-sm-inline ms-2">Edit Here</span>
    </button>
    <button
      class="btn btn-sm btn-light border ms-2"
      :class="{ active: showDetails }"
      aria-haspopup="true"
      :aria-expanded="showDetails"
      @click="toggleDetails"
    >
      <app-icon variant="info" no-margin />
    </button>
    <button
      v-show="props.item.isChangeset || props.item.isNote"
      class="btn btn-sm btn-light border ms-2"
      :class="{ active: showDiscussion }"
      aria-haspopup="true"
      :aria-expanded="showDiscussion"
      @click="toggleDiscussion"
    >
      <app-icon variant="chat_bubble_outline" no-margin />
      <span v-show="props.item.hasComments" class="badge bg-primary ms-2">
        {{ props.item.commentCount }}
      </span>
    </button>
    <button v-show="props.item.isFeedback" class="btn btn-sm btn-success ms-2">
      <app-icon variant="check" no-margin />
      <span class="d-none d-sm-inline ms-2">Mark as Resolved</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { ReviewListItem } from '~/services/review';

interface Props {
  item: ReviewListItem;
}

const props = defineProps<Props>();

const emit = defineEmits(['edit']);
const showDetails = defineModel<boolean>('showDetails');
const showDiscussion = defineModel<boolean>('showDiscussion');

function edit() {
  emit('edit');
}

function toggleDetails() {
  showDetails.value = !showDetails.value;
}

function toggleDiscussion() {
  showDiscussion.value = !showDiscussion.value;
}
</script>

<style lang="scss">
.review-toolbar {
  background-color: var(--bs-body-bg);
  border-radius: var(--bs-border-radius);
  padding: 1rem;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  box-shadow: var(--bs-box-shadow-lg);
}
</style>
