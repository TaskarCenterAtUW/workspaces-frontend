<template>
  <nav class="review-toolbar">
    <button
      class="btn btn-sm btn-light border me-3 d-md-none"
      type="button"
      title="Back to list"
      @click="emit('back')"
    >
      <app-icon
        variant="arrow_back"
        no-margin
      />
    </button>
    <span class="border-end pe-3 me-3">
      <app-icon
        :variant="props.item.badgeIcon"
        :class="typeClass"
      /><span class="d-none d-sm-inline fw-bold text-uppercase">{{ props.item.displayType }}:</span> #{{ props.item.id }}
    </span>
    <button
      class="btn btn-sm btn-primary"
      @click="edit"
    >
      <app-icon
        variant="edit_location_alt"
        no-margin
      />
      <span class="d-none d-sm-inline ms-2">Edit Here</span>
    </button>
    <button
      class="btn btn-sm btn-light border ms-2"
      :class="{ active: showDetails }"
      aria-haspopup="true"
      :aria-expanded="showDetails"
      @click="toggleDetails"
    >
      <app-icon
        variant="info"
        no-margin
      />
    </button>
    <button
      v-show="props.item.isChangeset || props.item.isNote"
      class="btn btn-sm btn-light border ms-2"
      :class="{ active: showDiscussion }"
      aria-haspopup="true"
      :aria-expanded="showDiscussion"
      @click="toggleDiscussion"
    >
      <app-icon
        variant="chat_bubble_outline"
        no-margin
      />
      <span
        v-show="props.item.hasComments"
        class="badge bg-primary ms-2"
      >
        {{ props.item.commentCount }}
      </span>
    </button>
    <BPopover
      content="Only validators and owners can resolve feedback"
      placement="bottom"
      :manual="isValidator"
    >
      <template #target>
        <div class="d-inline-block ms-2">
          <button
            v-show="props.item.isFeedback && !props.item.isResolved"
            class="btn btn-sm btn-success"
            :disabled="!isValidator"
          >
            <app-icon
              variant="check"
              no-margin
            />
            <span class="d-none d-sm-inline ms-2">Mark as Resolved</span>
          </button>
        </div>
      </template>
    </BPopover>
    <BPopover
      :disabled="isValidator"
      content="Only validators and owners can resolve changesets reviews"
      placement="bottom"
    >
      <template #target>
        <div class="d-inline-block ms-2">
          <button
            v-show="props.item.isChangeset && props.item.needsReview"
            class="btn btn-sm btn-success"
            :disabled="!isValidator"
            @click="resolveChangeset"
          >
            <app-icon
              variant="check"
              no-margin
            />
            <span class="d-none d-sm-inline ms-2">Mark as Reviewed</span>
          </button>
        </div>
      </template>
    </BPopover>
  </nav>
</template>

<script setup lang="ts">
import type { ReviewListItem } from '~/services/review';

interface Props {
  item: ReviewListItem;
}

const props = defineProps<Props>();
const emit = defineEmits(['back', 'edit', 'resolve']);

const { isValidator } = useWorkspaceRole();

const typeClass = computed(() => props.item.badgeClass.replace('bg-', 'text-'));

const showDetails = defineModel<boolean>('showDetails');
const showDiscussion = defineModel<boolean>('showDiscussion');

function edit() {
  emit('edit');
}

function resolveChangeset() {
  emit('resolve');
}

function toggleDetails() {
  showDetails.value = !showDetails.value;
}

function toggleDiscussion() {
  showDiscussion.value = !showDiscussion.value;
}
</script>

<style lang="scss">
@import "assets/scss/theme.scss";

.review-toolbar {
  display: flex;
  align-items: center;
  background-color: var(--bs-body-bg);
  border-radius: var(--bs-border-radius);
  padding: 1rem;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  box-shadow: var(--bs-box-shadow-lg);
  overflow-x: auto;

  @include media-breakpoint-down(sm) {
    & { padding: 0.5rem; }
  }
}
</style>
