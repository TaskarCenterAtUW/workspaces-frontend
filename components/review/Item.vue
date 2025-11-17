<template>
  <button ref="el" :class="classes">
    <div class="review-item-top">
      <span>
        <span class="badge" :class="props.item.badgeClass">
          <app-icon :variant="props.item.badgeIcon" />
          {{ props.item.displayType }}
        </span>
        <span class="ms-2">#{{ props.item.id }}</span>
        <span v-if="props.item.isResolved" class="badge bg-success mx-2">
          Resolved
        </span>
      </span>
      <span :class="elapsedClasses">
        <app-icon
          v-if="props.item.feedbackOverdue"
          variant="error_outline"
          class="overdue-icon"
          no-margin
        />
        {{ elapsed }}
      </span>
    </div>

    <div class="review-item-middle">{{ props.item.title }}</div>

    <div class="review-item-bottom">
      <span>
        <app-icon variant="account_box" />{{ props.item.displayName }}
      </span>

      <span v-if="props.item.hasComments" class="ms-auto me-3">
        <app-icon variant="chat" />{{ props.item.commentCount }}
      </span>
      <review-changes-badge
        v-if="props.item.isChangeset"
        v-bind="props.item.changesetCounts"
        :loading="props.item.loadingChangeset"
      />
    </div>
  </button>
</template>

<script lang="ts">
// Associate the DOM element with this item to carry it to the observer
// callback so we can load the changeset OSC:
//
export type ItemElement = HTMLButtonElement & { wsReviewItem: ReviewListItem };
</script>

<script setup lang="ts">
import { ReviewListItem } from '~/services/review';
import { formatElapsed } from '~/util/time';

interface Props {
  item: ReviewListItem;
  selected: boolean;
  changesetObserver: IntersectionObserver;
}

const props = defineProps<Props>();
const el = useTemplateRef<ItemElement>('el');

const classes = computed(() => ({
  'review-item': true,
  'list-group-item': true,
  'list-group-item-action': true,
  'active': props.selected
}));
const elapsed = computed(() => formatElapsed(props.item.data.created_at));
const elapsedClasses = computed(() => ({
  'text-danger': props.item.feedbackOverdue
}));

if (props.item.isChangeset) {
  onMounted(() => {
    if (el.value) {
      // Associate the DOM element with this item to carry it to the observer
      // callback so we can load the changeset OSC:
      //
      el.value.wsReviewItem = props.item;

      props.changesetObserver.observe(el.value);
    }
  });
}
</script>

<style lang="scss">
.review-item.list-group-item {
  cursor: pointer;
  border-left: none;
  border-right: none;
  border-radius: 0;

  .badge {
    text-transform: uppercase;
  }
}

.review-item-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8em;

  .overdue-icon {
    font-size: 16px;
  }
}

.review-item-middle {
  margin-top: 0.5rem;

  /* Truncate to 3 lines: */
  overflow: hidden;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;

  /* Fallback for line-clamp: */
  max-height: 4.5em;
}

.review-item-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9em;
}
</style>
