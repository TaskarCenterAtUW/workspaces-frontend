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
          >
          Needs Review Only
        </label>
      </div>
    </div>

    <b-dropdown-divider />

    <div class="px-3 py-2 review-filter-changesets">
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
          No contributors in the loaded changesets.
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
        Date and contributor filters are sent to the server. Team filters apply
        to the matching {{ CHANGESET_LIST_LIMIT }} changesets it returns.
      </p>
    </div>

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
        :disabled="!hasChangesetFilters"
        @click="clearChangesetFilters"
      >
        Clear changeset filters
      </button>
    </div>
  </b-dropdown>
</template>

<script setup lang="ts">
import {
  CHANGESET_LIST_LIMIT,
  endOfDateInput,
  startOfDateInput,
  toDateInputValue,
} from '~/services/review';
import type { ReviewContributor, ReviewListFilter } from '~/services/review';
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
const hasChangesetFilters = computed(() => Boolean(
  filter.value.startDate
  || filter.value.endDate
  || filter.value.contributorId !== undefined
  || filter.value.teamIds.length
));

function apply() {
  if (filter.value.hasDateRangeError) {
    return;
  }
  closeAndApply();
}

function clearChangesetFilters() {
  filter.value.startDate = undefined;
  filter.value.endDate = undefined;
  filter.value.contributorId = undefined;
  filter.value.teamIds = [];
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
