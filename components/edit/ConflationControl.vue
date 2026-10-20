<template>
  <aside
    class="conflation-panel"
    aria-label="Conflation"
  >
    <h2 class="conflation-heading">
      Conflate a TDEI Dataset
    </h2>
    <p class="conflation-hint">
      Its features show as suggestions to accept or ignore, tile by tile, where they would add to this workspace.
    </p>
    <form
      aria-label="Conflate a TDEI dataset"
      @submit.prevent="add"
    >
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
        {{ busy ? 'Loading dataset…' : 'Add suggestions' }}
      </button>
      <p
        v-if="error"
        class="text-danger mt-2 mb-0"
        role="alert"
      >
        {{ error }}
      </p>
    </form>

    <section
      v-if="datasets.length"
      class="conflation-section"
    >
      <h2 class="conflation-heading">
        Added Datasets
      </h2>
      <div
        v-for="added in datasets"
        :key="added.datasetID"
        class="conflation-dataset"
      >
        <strong>{{ added.tdeiDatasetId }}</strong>: {{ added.edges }} edges, {{ added.nodes }} nodes.
        <button
          type="button"
          class="btn btn-link btn-sm p-0 align-baseline"
          @click="zoomTo(added.bounds)"
        >
          Go to it
        </button>
        <div class="form-check mt-1">
          <input
            :id="`conflation-removed-${added.datasetID}`"
            class="form-check-input"
            type="checkbox"
            :checked="added.showRemoved"
            @change="toggleRemoved(added, ($event.target as HTMLInputElement).checked)"
          >
          <label
            class="form-check-label"
            :for="`conflation-removed-${added.datasetID}`"
          >Show dropped edges (duplicates, in grey)</label>
        </div>
      </div>
    </section>

    <section
      v-if="datasets.length"
      class="conflation-section"
      aria-label="Review suggestions"
    >
      <h2 class="conflation-heading">
        Review Suggestions
      </h2>
      <select
        v-if="datasets.length > 1"
        v-model="reviewDatasetID"
        class="form-select form-select-sm mb-2"
        aria-label="Dataset to review"
        :disabled="reviewing"
      >
        <option
          v-for="added in datasets"
          :key="added.datasetID"
          :value="added.datasetID"
        >
          {{ added.tdeiDatasetId }}
        </option>
      </select>
      <div class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary flex-fill"
          :disabled="reviewing"
          @click="step(-1)"
        >
          Previous
        </button>
        <button
          type="button"
          class="btn btn-sm btn-primary flex-fill"
          :disabled="reviewing"
          @click="step(1)"
        >
          Next
        </button>
      </div>
      <p
        class="conflation-hint mt-2 mb-0"
        role="status"
      >
        {{ reviewStatus }}
      </p>
    </section>
  </aside>
</template>

<script setup lang="ts">
// @test unit: adding a dataset ID calls the conflation service with the ID and snapping distance, then lists the dataset with its edge and node counts
// @test unit: a failed download shows its error and leaves the form usable
// @test unit: "Go to it" centres the map on the dataset
// @test unit: "Show dropped edges" shows and hides the TDEI edges the union dropped, for that dataset
// @test unit: Next and Previous step through the chosen dataset's pending suggestions, showing the tile and position, or that none are left that way

import type { ReviewPosition } from '~/services/conflation/rapid-service';
import type { Bounds } from '~/services/conflation/suggestions';

const props = defineProps<{
  /** The conflation service (see services/conflation/rapid-service.ts). */
  service: {
    addDatasetAsync(id: string, proximity: number): Promise<{ datasetID: string; nodes: number; edges: number; bounds: Bounds }>;
    showRemoved(datasetID: string, show: boolean): void;
    reviewStepAsync(datasetID: string, direction: 1 | -1, onSearch?: (tile: number, tiles: number) => void): Promise<ReviewPosition>;
  };
  /** Rapid's map, to move to an added dataset. */
  map?: { centerZoomEase(loc: [number, number], zoom: number): unknown };
}>();

const datasetId = ref('');
const proximity = ref(0.5);
const busy = ref(false);
const error = ref('');
interface AddedDataset {
  datasetID: string;
  tdeiDatasetId: string;
  nodes: number;
  edges: number;
  bounds: Bounds;
  showRemoved: boolean;
}
const datasets = ref<AddedDataset[]>([]);

async function add() {
  const id = datasetId.value.trim();
  if (!id) return;
  busy.value = true;
  error.value = '';
  try {
    const added = await props.service.addDatasetAsync(id, proximity.value || 0.5);
    datasets.value = [...datasets.value.filter(d => d.datasetID !== added.datasetID), { ...added, tdeiDatasetId: id, showRemoved: false }];
    reviewDatasetID.value = added.datasetID;
    datasetId.value = '';
  } catch (e) {
    console.error('Conflation dataset failed to load', e);
    error.value = `Couldn't load that dataset: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    busy.value = false;
  }
}

const reviewDatasetID = ref('');
const reviewing = ref(false);
const reviewStatus = ref('Step through the suggestions one at a time; each opens in the sidebar to accept or ignore.');

async function step(direction: 1 | -1) {
  reviewing.value = true;
  try {
    const at = await props.service.reviewStepAsync(reviewDatasetID.value, direction, (tile, tiles) => {
      reviewStatus.value = `Looking for suggestions: area ${tile} of ${tiles}…`;
    });
    reviewStatus.value = at.suggestionID
      ? `Suggestion ${at.index} of ${at.count} in area ${at.tile} of ${at.tiles}.`
      : direction > 0 ? 'No more suggestions after this one.' : 'No suggestions before this one.';
  } catch (e) {
    console.error('Conflation review failed', e);
    reviewStatus.value = `Couldn't move to the next suggestion: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    reviewing.value = false;
  }
}

function toggleRemoved(added: AddedDataset, show: boolean) {
  props.service.showRemoved(added.datasetID, show);
  added.showRemoved = show;
}

function zoomTo([w, s, e, n]: Bounds) {
  props.map?.centerZoomEase([(w + e) / 2, (s + n) / 2], 17);
}
</script>

<style scoped>
/* Docked to the right of the editor, like the Pathways panel */
.conflation-panel {
  flex: 0 0 18rem;
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

.conflation-dataset + .conflation-dataset {
  margin-top: 0.75rem;
}
</style>
