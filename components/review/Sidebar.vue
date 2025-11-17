<template>
  <section class="review-sidebar">
    <header class="border-top">
      <h2 class="h5">
        Reviewing Workspace
      </h2>
      <review-filter-dropdown
        v-model="filter"
        @apply="refresh"
      />
    </header>

    <header class="border-top border-bottom">
      <h3>{{ props.reviewList.workspace?.title }}</h3>
      <button
        class="btn btn-light btn-sm border ms-auto"
        @click="refresh"
      >
        <app-icon
          variant="refresh"
          no-margin
        />
        <span class="visually-hidden">Refresh</span>
      </button>
    </header>

    <div
      ref="reviewListGroup"
      class="list-group"
    >
      <app-spinner v-if="loading" />
      <review-item
        v-for="item in items"
        :key="item.key"
        :item="item"
        :changeset-observer="changesetObserver"
        :selected="item === currentItem"
        @click="currentItem = item"
      />
    </div>
  </section><!-- .review-sidebar -->
</template>

<script setup lang="ts">
import type { ItemElement } from '~/components/review/Item.vue';
import type {
  ReviewList,
  ReviewListFilter,
  ReviewListItem,
} from '~/services/review';

interface Props {
  reviewList: ReviewList;
  loading: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits(['refresh']);
const currentItem = defineModel<ReviewListItem>('item');
const filter = defineModel<ReviewListFilter>('filter', { required: true });
const reviewListGroup = useTemplateRef<HTMLDivElement>('reviewListGroup');
const items = reactive(props.reviewList.items);

let changesetObserver: IntersectionObserver;

onMounted(() => {
  // We load some additional data when a changeset item scrolls into view:
  changesetObserver = new IntersectionObserver(
    onChangesetObserved,
    {
      root: reviewListGroup.value,
      threshold: 0.2,
    },
  );
});

onUnmounted(() => {
  if (changesetObserver) {
    changesetObserver.disconnect();
  }
});

function onChangesetObserved(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      const target = entry.target as ItemElement;
      changesetObserver.unobserve(target);
      props.reviewList.loadOsmChange(target.wsReviewItem);
    }
  }
}

function refresh() {
  emit('refresh');
}
</script>

<style lang="scss">
.review-sidebar {
  display: flex;
  flex-direction: column;
  background-color: var(--bs-body-bg);
  flex-basis: 25%;
  min-width: 22rem;
  max-width: 35rem;
  box-shadow: var(--bs-box-shadow);
  z-index: 901;

  header {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;

    h2 {
      margin: 0;
    }
    h3 {
      display: block;
      font-size: 1rem;
      margin-bottom: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  label {
    white-space: nowrap;
  }

  .list-group {
    position: relative;
    overflow: auto;
    flex-grow: 1;

    .spinner-border {
      position: absolute;
      top: calc(50% - 1rem);
      left: 0;
      right: 0;
      margin: 0 auto;
    }
  }

  .list-group-item:first-child {
    border-top: 0;
    border-radius: 0;
  }
}
</style>
