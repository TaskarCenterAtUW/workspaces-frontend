<template>
  <b-dropdown
    v-model="dropdownOpen"
    class="ms-auto"
    toggle-class="border"
    variant="light"
    size="sm"
    placement="bottom-end"
    auto-close="outside"
    menu-class="review-filter-menu"
    no-caret
    @hidden="onDropdownHidden"
  >
    <template #button-content>
      <app-icon
        variant="settings"
        no-margin
      />
      <span class="visually-hidden">Settings</span>
    </template>

    <div class="px-3 py-2">
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeChangesets"
            type="checkbox"
            class="form-check-input"
            :disabled="filter.includeNeedsReview"
            @change="onOsmTypesChanged"
          >
          Changesets
        </label>
      </div>
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeFeedback"
            type="checkbox"
            class="form-check-input"
            :disabled="filter.includeNeedsReview"
            @change="applyTypes"
          >
          Feedback
        </label>
      </div>
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeNotes"
            type="checkbox"
            class="form-check-input"
            :disabled="filter.includeNeedsReview"
            @change="onOsmTypesChanged"
          >
          Notes
        </label>
      </div>
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeFixmes"
            type="checkbox"
            class="form-check-input"
            :disabled="filter.includeNeedsReview"
            @change="applyTypes"
          >
          Fixmes
        </label>
      </div>
    </div>

    <b-dropdown-divider />

    <div class="px-3 py-2">
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeResolved"
            type="checkbox"
            class="form-check-input"
            :disabled="!hasResolvableTypes || filter.includeNeedsReview"
          >
          Show Resolved
        </label>
      </div>
      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="filter.includeNeedsReview"
            type="checkbox"
            class="form-check-input"
            :disabled="!filter.includeChangesets"
            @change="onNeedsReviewChanged"
          >
          Needs Review Only
        </label>
      </div>
      <p class="text-body-secondary small mb-0 mt-1">
        Shows only unresolved Changesets marked as needing review.
      </p>
    </div>

    <b-dropdown-divider />

    <div
      v-if="hasOsmTypes"
      class="px-3 py-2 review-filter-changesets"
    >
      <fieldset class="mb-2">
        <legend class="review-filter-legend">
          Created
        </legend>
        <div class="d-flex gap-2">
          <label class="review-filter-date">
            From
            <input
              v-model="fromDate"
              type="date"
              class="form-control form-control-sm"
              :max="toDate || undefined"
            >
          </label>
          <label class="review-filter-date">
            To
            <input
              v-model="toDate"
              type="date"
              class="form-control form-control-sm"
              :min="fromDate || undefined"
            >
          </label>
        </div>
        <p
          v-if="filter.hasDateRangeError"
          class="text-danger small mb-0 mt-1"
          role="alert"
        >
          "From" must be on or before "To".
        </p>
      </fieldset>

      <fieldset class="mb-2">
        <legend class="review-filter-legend">
          Contributors
        </legend>
        <div
          v-if="props.contributors.length"
          class="review-filter-options"
        >
          <div class="form-check">
            <label class="form-check-label">
              <input
                v-model="filter.contributorId"
                type="radio"
                class="form-check-input"
                :value="undefined"
              >
              All contributors
            </label>
          </div>
          <div
            v-for="contributor in props.contributors"
            :key="contributor.uid"
            class="form-check"
          >
            <label class="form-check-label">
              <input
                v-model="filter.contributorId"
                type="radio"
                class="form-check-input"
                :value="contributor.uid"
              >
              {{ contributor.user }}
            </label>
          </div>
        </div>
        <p
          v-else
          class="text-body-secondary small mb-0"
        >
          No contributors in the loaded Changesets or Notes.
        </p>
      </fieldset>

      <fieldset class="mb-2">
        <legend class="review-filter-legend">
          Teams
        </legend>
        <div
          v-if="props.teams.length"
          class="review-filter-options"
        >
          <div
            v-for="team in props.teams"
            :key="team.id"
            class="form-check"
          >
            <label class="form-check-label">
              <input
                v-model="filter.teamIds"
                type="checkbox"
                class="form-check-input"
                :value="team.id"
              >
              {{ team.name }}
            </label>
          </div>
        </div>
        <p
          v-else
          class="text-body-secondary small mb-0"
        >
          This workspace has no teams.
        </p>
      </fieldset>

      <p class="text-body-secondary small mb-0">
        These filters apply to Changesets and Notes. Feedback and Fixmes are
        hidden while a filter is active.
      </p>
    </div>
    <p
      v-else
      class="text-body-secondary small px-3 py-2 mb-0 review-filter-changesets"
    >
      Date, contributor, and team filters are available when Changesets or Notes are enabled.
    </p>

    <b-dropdown-divider />

    <div class="px-3 py-2 d-flex gap-2">
      <button
        class="btn btn-primary btn-sm"
        :disabled="filter.hasDateRangeError"
        @click="apply"
      >
        Apply
      </button>
      <button
        class="btn btn-light border btn-sm"
        type="button"
        :disabled="!hasActiveFilters"
        @click="clearFilters"
      >
        Clear filters
      </button>
    </div>
  </b-dropdown>
</template>

<script setup lang="ts">
import {
  endOfDateInput,
  ReviewListFilter,
  startOfDateInput,
  toDateInputValue,
} from '~/services/review';
import type { ReviewContributor } from '~/services/review';
import type { WorkspaceTeam } from '~/types/workspaces';

interface Props {
  contributors?: ReviewContributor[];
  teams?: WorkspaceTeam[];
}

const props = withDefaults(defineProps<Props>(), {
  contributors: () => [],
  teams: () => []
});
const filter = defineModel<ReviewListFilter>({ required: true });
const emit = defineEmits(['apply']);
const dropdownOpen = ref(false);
let applyAfterClose = false;

const fromDate = computed({
  get: () => toDateInputValue(filter.value.startDate),
  set: (value: string) => {
    filter.value.startDate = startOfDateInput(value);
  }
});
const toDate = computed({
  get: () => toDateInputValue(filter.value.endDate),
  set: (value: string) => {
    filter.value.endDate = endOfDateInput(value);
  }
});
const hasActiveFilters = computed(() => Boolean(
  !filter.value.includeChangesets
  || !filter.value.includeFeedback
  || !filter.value.includeNotes
  || !filter.value.includeFixmes
  || filter.value.includeResolved
  || filter.value.includeNeedsReview
  || filter.value.hasOsmFilters
));
const hasOsmTypes = computed(() => filter.value.includeChangesets || filter.value.includeNotes);
const hasResolvableTypes = computed(() => Boolean(
  filter.value.includeChangesets
  || filter.value.includeFeedback
  || filter.value.includeNotes
));

function applyTypes() {
  if (!filter.value.includeChangesets) {
    filter.value.includeNeedsReview = false;
  }
  if (!hasResolvableTypes.value) {
    filter.value.includeResolved = false;
  }
  if (filter.value.hasDateRangeError) {
    return;
  }
  emit('apply');
}

function onOsmTypesChanged() {
  filter.value.contributorId = undefined;
  if (!filter.value.includeChangesets && !filter.value.includeNotes) {
    filter.value.startDate = undefined;
    filter.value.endDate = undefined;
    filter.value.teamIds = [];
  }
  applyTypes();
}

function onNeedsReviewChanged() {
  if (filter.value.includeNeedsReview) {
    filter.value.includeChangesets = true;
    filter.value.includeFeedback = false;
    filter.value.includeNotes = false;
    filter.value.includeFixmes = false;
    filter.value.includeResolved = false;
    filter.value.contributorId = undefined;
  }
  applyTypes();
}

function apply() {
  if (filter.value.hasDateRangeError) {
    return;
  }
  closeAndApply();
}

function clearFilters() {
  Object.assign(filter.value, new ReviewListFilter());
  closeAndApply();
}

function closeAndApply() {
  if (!dropdownOpen.value) {
    emit('apply');
    return;
  }

  applyAfterClose = true;
  dropdownOpen.value = false;
}

function onDropdownHidden() {
  if (!applyAfterClose) {
    return;
  }

  applyAfterClose = false;
  emit('apply');
}
</script>

<style lang="scss">
.review-filter-menu {
  max-height: calc(100vh - 9rem);
  overflow-y: auto;
}

.review-filter-changesets {
  width: 21rem;
  max-width: calc(100vw - 2rem);

  fieldset {
    min-width: 0;
  }
}

.review-filter-legend {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.review-filter-date {
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
}

.review-filter-options {
  max-height: 8rem;
  overflow-y: auto;

  .form-check-label {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
