<template>
  <aside
    class="conflation-panel"
    aria-label="Conflation"
  >
    <div class="conflation-panel-header">
      <h2 class="conflation-heading mb-0">
        Conflate a TDEI Dataset
      </h2>
      <button
        v-if="dataset"
        type="button"
        class="btn-close"
        title="Stop conflating this dataset"
        aria-label="Stop conflating this dataset"
        @click="remove"
      />
    </div>

    <form
      v-if="!dataset"
      aria-label="Conflate a TDEI dataset"
      @submit.prevent="add"
    >
      <p class="conflation-hint">
        Its features show as suggested edits to accept or ignore, where they would add to this workspace.
      </p>
      <label
        class="form-label mb-1"
        for="conflation-dataset-id"
      >TDEI dataset ID</label>
      <input
        id="conflation-dataset-id"
        v-model="datasetId"
        class="form-control form-control-sm mb-2"
        required
        :disabled="busy"
      >
      <label
        class="form-label mb-1"
        for="conflation-proximity"
      >Snapping distance (m)</label>
      <input
        id="conflation-proximity"
        v-model.number="proximity"
        type="number"
        min="0.1"
        max="10"
        step="0.1"
        class="form-control form-control-sm mb-2"
        :disabled="busy"
      >
      <button
        type="submit"
        class="btn btn-sm btn-primary w-100"
        :disabled="busy || !datasetId.trim()"
      >
        {{ busy ? 'Loading dataset…' : 'Add Suggested Edits' }}
      </button>
      <p
        v-if="error"
        class="text-danger mt-2 mb-0"
        role="alert"
      >
        {{ error }}
      </p>
    </form>

    <template v-else>
      <section
        class="conflation-dataset"
        aria-label="Dataset being conflated"
      >
        <div class="conflation-dataset-header">
          <h3 class="conflation-dataset-title">
            TDEI dataset
          </h3>
          <button
            type="button"
            class="btn btn-sm conflation-zoom"
            title="Zoom to the dataset's extent"
            aria-label="Zoom to the dataset's extent"
            @click="props.service.zoomToDataset(dataset.datasetID)"
          >
            <app-icon
              variant="zoom_in"
              no-margin
            />
          </button>
        </div>
        <div class="conflation-dataset-id text-break">
          {{ dataset.tdeiDatasetId }}
        </div>
        <div class="conflation-dataset-row">
          <span class="conflation-counts">
            <span
              class="badge text-bg-light"
              :title="`${dataset.nodes} nodes in the TDEI dataset`"
            >{{ dataset.nodes }} node{{ dataset.nodes !== 1 ? 's' : '' }}</span>
            <span
              class="badge text-bg-light"
              :title="`${dataset.edges} edges in the TDEI dataset`"
            >{{ dataset.edges }} edge{{ dataset.edges !== 1 ? 's' : '' }}</span>
          </span>
        </div>
      </section>

      <section
        class="conflation-section"
        aria-label="Review suggested edits"
      >
        <div class="conflation-review-header">
          <h2 class="conflation-heading mb-0">
            Review Suggested Edits
          </h2>
          <b-dropdown
            size="sm"
            variant="link"
            auto-close="outside"
            no-caret
            placement="bottom-end"
            toggle-class="conflation-filter-toggle"
            :title="`Filter suggested edits${activeFilters ? ` (${activeFilters} on)` : ''}`"
          >
            <template #button-content>
              <app-icon
                variant="filter_alt"
                no-margin
              />
              <span
                v-if="activeFilters"
                class="badge rounded-pill text-bg-primary conflation-filter-count"
              >{{ activeFilters }}</span>
              <span class="visually-hidden">Filter suggested edits</span>
            </template>
            <b-dropdown-form class="conflation-filters">
              <div class="form-check mb-1">
                <input
                  id="conflation-skip-confident"
                  v-model="skipConfident"
                  class="form-check-input"
                  type="checkbox"
                  @change="applySkip"
                >
                <label
                  class="form-check-label"
                  for="conflation-skip-confident"
                >Skip tag edits with confidence ≥ {{ threshold.toFixed(2) }}</label>
              </div>
              <input
                v-model.number="threshold"
                type="range"
                class="form-range"
                min="0.15"
                max="1"
                step="0.05"
                aria-label="Confidence threshold for skipping tag edits"
                :disabled="!skipConfident"
                @input="applySkip"
              >
              <div class="form-check mb-1">
                <input
                  id="conflation-skip-osm-id"
                  v-model="skipOsmId"
                  class="form-check-input"
                  type="checkbox"
                  @change="applySkip"
                >
                <label
                  class="form-check-label"
                  for="conflation-skip-osm-id"
                >Skip tag edits that add <code>ext:osm_id</code></label>
              </div>
            </b-dropdown-form>
          </b-dropdown>
        </div>
        <dl class="conflation-stats">
          <dt>Total tiles</dt>
          <dd>{{ stats.tiles }}</dd>
          <dt>Tiles reviewed</dt>
          <dd>{{ stats.reviewed }}</dd>
        </dl>
        <div
          class="progress mb-3"
          role="progressbar"
          aria-label="Tiles reviewed"
          :aria-valuenow="stats.reviewed"
          aria-valuemin="0"
          :aria-valuemax="stats.tiles"
        >
          <div
            class="progress-bar"
            :style="{ width: `${stats.tiles ? (100 * stats.reviewed) / stats.tiles : 0}%` }"
          />
        </div>
        <p
          v-if="skipConfident || skipOsmId"
          class="conflation-hint"
        >
          {{ stats.skipped }} tag edits skipped so far, in the tiles computed. They stay on the map. New edges are always reviewed.
        </p>

        <div class="d-flex gap-2">
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary flex-fill"
            title="Previous suggested edit"
            aria-label="Previous suggested edit"
            :disabled="reviewing"
            @click="step(-1)"
          >
            <app-icon
              variant="arrow_back"
              no-margin
            />
          </button>
          <button
            type="button"
            class="btn btn-sm btn-primary flex-fill"
            title="Next suggested edit"
            aria-label="Next suggested edit"
            :disabled="reviewing"
            @click="step(1)"
          >
            <app-icon
              variant="arrow_forward"
              no-margin
            />
          </button>
        </div>
        <p
          class="conflation-hint mt-2"
          role="status"
        >
          {{ reviewStatus }}
        </p>

        <div
          v-if="item"
          class="conflation-item"
          aria-label="Item under review"
        >
          <h3 class="conflation-item-heading">
            {{ ITEM_TITLES[item.kind] }}
          </h3>
          <ul class="conflation-notes">
            <li
              v-for="note in item.notes"
              :key="note"
            >
              {{ note }}
            </li>
          </ul>
          <table class="conflation-tags">
            <tbody>
              <tr
                v-for="(value, key) in item.tags"
                :key="key"
              >
                <th scope="row">
                  {{ key }}
                </th>
                <td>{{ value }}</td>
              </tr>
            </tbody>
          </table>
          <details
            v-if="Object.keys(item.unionTags).length"
            class="mt-2"
          >
            <summary>Union details (not written)</summary>
            <table class="conflation-tags">
              <tbody>
                <tr
                  v-for="(value, key) in item.unionTags"
                  :key="key"
                >
                  <th scope="row">
                    {{ key }}
                  </th>
                  <td>{{ value }}</td>
                </tr>
              </tbody>
            </table>
          </details>
          <div
            v-if="item.actionable"
            class="d-flex gap-2 mt-2"
          >
            <button
              type="button"
              class="btn btn-sm btn-success flex-fill"
              :disabled="reviewing"
              @click="accept"
            >
              Accept
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger flex-fill"
              :disabled="reviewing"
              @click="ignore"
            >
              Ignore
            </button>
          </div>
          <p
            v-else-if="item.kind !== 'removed'"
            class="conflation-hint mt-2 mb-0"
          >
            Already accepted or ignored.
          </p>
        </div>
      </section>
    </template>
  </aside>
</template>

<script setup lang="ts">
// @test unit: adding a dataset ID calls the conflation service with the ID and snapping distance, then shows that dataset in place of the form
// @test unit: a failed download shows its error and leaves the form usable
// @test unit: the zoom button beside the dataset header zooms to the dataset's extent; the X beside the panel heading stops conflating it and brings the form back
// @test unit: total tiles, tiles reviewed and the progress bar follow the service's review counts as they change
// @test unit: "Skip tag edits with confidence ≥ X" sets the service's threshold from the slider (or clears it when unchecked) and shows how many were skipped
// @test unit: "Skip tag edits that add ext:osm_id" turns the service's ext:osm_id filter on and off
// @test unit: the skip options are in a filter dropdown beside the "Review Suggested Edits" heading, which shows how many filters are on
// @test unit: the next and previous arrows step through pending suggestions, spiralling clockwise out from the map view's centre
// @test unit: the item under review shows what it would write and how it joins the workspace; Accept accepts it, Ignore ignores it and moves to the next

import type { ReviewItem, ReviewPosition, ReviewStats } from '~/services/conflation/rapid-service';
import type { Bounds } from '~/services/conflation/suggestions';

const props = defineProps<{
  /** The conflation service (see services/conflation/rapid-service.ts). */
  service: {
    addDatasetAsync(id: string, proximity: number): Promise<{ datasetID: string; nodes: number; edges: number; bounds: Bounds }>;
    removeDataset(datasetID: string): void;
    zoomToDataset(datasetID: string): void;
    reviewStepAsync(datasetID: string, direction: 1 | -1, onSearch?: (tile: number, tiles: number) => void): Promise<ReviewPosition>;
    reviewStats(datasetID: string): ReviewStats;
    setSkipConfidence(datasetID: string, threshold: number | undefined): void;
    setSkipOsmId(datasetID: string, skip: boolean): void;
    currentItem(datasetID: string): ReviewItem | undefined;
    acceptCurrent(datasetID: string): void;
    ignoreCurrent(datasetID: string): void;
    on(event: 'reviewchange', listener: () => void): unknown;
    off(event: 'reviewchange', listener: () => void): unknown;
  };
}>();

const ITEM_TITLES: Record<ReviewItem['kind'], string> = {
  edge: 'New edge',
  tags: 'Tags to add',
  removed: 'Dropped edge'
};

interface Dataset {
  datasetID: string;
  tdeiDatasetId: string;
  nodes: number;
  edges: number;
  bounds: Bounds;
}

const datasetId = ref('');
const proximity = ref(0.5);
const busy = ref(false);
const error = ref('');
/** The one dataset being conflated, once added. */
const dataset = ref<Dataset | null>(null);

const stats = ref<ReviewStats>({ tiles: 0, reviewed: 0, skipped: 0 });
const item = ref<ReviewItem | undefined>();
const reviewing = ref(false);
const skipConfident = ref(false);
const threshold = ref(0.9);
const skipOsmId = ref(false);
/** How many review filters are on, shown on the filter button. */
const activeFilters = computed(() => Number(skipConfident.value) + Number(skipOsmId.value));

function applySkip() {
  if (!dataset.value) return;
  props.service.setSkipConfidence(dataset.value.datasetID, skipConfident.value ? threshold.value : undefined);
  props.service.setSkipOsmId(dataset.value.datasetID, skipOsmId.value);
}
const reviewStatus = ref('Use the arrows to step through the suggested edits, spiralling out from the centre of the map view.');

function refresh() {
  const id = dataset.value?.datasetID;
  stats.value = id ? props.service.reviewStats(id) : { tiles: 0, reviewed: 0, skipped: 0 };
  item.value = id ? props.service.currentItem(id) : undefined;
}
onMounted(() => props.service.on('reviewchange', refresh));
onBeforeUnmount(() => props.service.off('reviewchange', refresh));

async function add() {
  const id = datasetId.value.trim();
  if (!id) return;
  busy.value = true;
  error.value = '';
  try {
    const added = await props.service.addDatasetAsync(id, proximity.value || 0.5);
    dataset.value = { ...added, tdeiDatasetId: id };
    datasetId.value = '';
    refresh();
  } catch (e) {
    console.error('Conflation dataset failed to load', e);
    error.value = `Couldn't load that dataset: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    busy.value = false;
  }
}

function remove() {
  if (!dataset.value) return;
  props.service.removeDataset(dataset.value.datasetID);
  dataset.value = null;
  refresh();
}

async function step(direction: 1 | -1) {
  if (!dataset.value) return;
  reviewing.value = true;
  try {
    const at = await props.service.reviewStepAsync(dataset.value.datasetID, direction, (tile, tiles) => {
      reviewStatus.value = `Looking for suggested edits: tile ${tile} of ${tiles}…`;
    });
    reviewStatus.value = at.suggestionID
      ? `Edit ${at.index} of ${at.count} left in this tile.`
      : direction > 0 ? 'No more suggested edits after this one.' : 'No suggested edits before this one.';
  } catch (e) {
    console.error('Conflation review failed', e);
    reviewStatus.value = `Couldn't move to the next suggested edit: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    reviewing.value = false;
    refresh();
  }
}

function accept() {
  if (!dataset.value) return;
  props.service.acceptCurrent(dataset.value.datasetID);
  reviewStatus.value = 'Accepted. It\'s selected for editing; use the next arrow to continue.';
  refresh();
}

async function ignore() {
  if (!dataset.value) return;
  props.service.ignoreCurrent(dataset.value.datasetID);
  await step(1);
}
</script>

<style scoped>
/* Docked to the right of the editor, like the Pathways panel */
.conflation-panel {
  flex: 0 0 22rem;
  height: 100%;
  overflow-y: auto;
  padding: 0.75rem;
  border-left: 1px solid var(--bs-border-color);
  background: var(--bs-body-bg);
  font-size: 0.875rem;
}

.conflation-heading {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.conflation-hint {
  color: var(--bs-secondary-color);
  margin-bottom: 0.75rem;
}

.conflation-section {
  margin-top: 1.25rem;
}

/* The dataset being conflated, set off as its own shaded section */
.conflation-dataset {
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius);
  background: var(--bs-tertiary-bg);
}

.conflation-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.conflation-dataset-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.conflation-dataset-title {
  margin-bottom: 0;
  font-size: 0.875rem;
  font-weight: normal;
}

.conflation-dataset-id {
  font-weight: 600;
}

/* Like the Pathways panel's node and edge pills */
.conflation-counts {
  display: flex;
  gap: 0.25rem;
}

.conflation-dataset-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

/* Matches the Pathways panel's zoom-to-extent buttons */
.conflation-zoom {
  display: flex;
  align-items: center;
  padding: 0 0.25rem;
  border: 0;
  color: inherit;
}

.conflation-review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

/* The dropdown renders its own toggle button, outside these scoped styles. */
:deep(.conflation-filter-toggle) {
  display: flex;
  align-items: center;
  padding: 0 0.25rem;
  border: 0;
  color: inherit;
}

/* The filter dropdown's options; it stays open while they're changed. */
.conflation-filters {
  width: 18rem;
  font-size: 0.875rem;
}

.conflation-filter-count {
  margin-left: 0.125rem;
  font-size: 0.65rem;
}

.conflation-stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.125rem 0.5rem;
  margin-bottom: 0.5rem;
}

.conflation-stats dt {
  font-weight: normal;
}

.conflation-stats dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}

.progress {
  height: 0.5rem;
}

.conflation-item {
  padding: 0.5rem;
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius);
}

.conflation-item-heading {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.conflation-notes {
  padding-left: 1rem;
  margin-bottom: 0.5rem;
  color: var(--bs-secondary-color);
}

.conflation-tags {
  width: 100%;
  font-size: 0.8rem;
  table-layout: fixed;
}

.conflation-tags th,
.conflation-tags td {
  padding: 0.0625rem 0.25rem 0.0625rem 0;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.conflation-tags th {
  width: 45%;
  font-weight: normal;
  color: var(--bs-secondary-color);
}
</style>
