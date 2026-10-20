<template>
  <div class="conflation-control">
    <button
      v-if="!open"
      type="button"
      class="btn btn-sm btn-light conflation-toggle"
      @click="open = true"
    >
      <app-icon
        variant="merge"
        no-margin
      />
      Conflate TDEI dataset
    </button>

    <form
      v-else
      class="conflation-panel card shadow-sm"
      aria-label="Conflate a TDEI dataset"
      @submit.prevent="add"
    >
      <div class="card-body">
        <div class="d-flex align-items-center mb-2">
          <h2 class="h6 mb-0 flex-grow-1">
            Conflate a TDEI dataset
          </h2>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            @click="open = false"
          />
        </div>
        <p class="small text-body-secondary mb-2">
          Its features show as suggestions to accept or ignore, tile by tile, where they would add to this workspace.
        </p>
        <label
          class="form-label small mb-1"
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
          class="form-label small mb-1"
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
          class="small text-danger mt-2 mb-0"
          role="alert"
        >
          {{ error }}
        </p>
        <div
          v-for="added in datasets"
          :key="added.datasetID"
          class="small mt-2"
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
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
// @test unit: adding a dataset ID calls the conflation service with the ID and snapping distance, then lists the dataset with its edge and node counts
// @test unit: a failed download shows its error and leaves the form usable
// @test unit: "Go to it" centres the map on the dataset
// @test unit: "Show dropped edges" shows and hides the TDEI edges the union dropped, for that dataset

import type { Bounds } from '~/services/conflation/suggestions';

const props = defineProps<{
  /** The conflation service (see services/conflation/rapid-service.ts). */
  service: {
    addDatasetAsync(id: string, proximity: number): Promise<{ datasetID: string; nodes: number; edges: number; bounds: Bounds }>;
    showRemoved(datasetID: string, show: boolean): void;
  };
  /** Rapid's map, to move to an added dataset. */
  map?: { centerZoomEase(loc: [number, number], zoom: number): unknown };
}>();

const open = ref(false);
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
    datasetId.value = '';
  } catch (e) {
    console.error('Conflation dataset failed to load', e);
    error.value = `Couldn't load that dataset: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    busy.value = false;
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
/* Placed inside Rapid's map area: its bottom-left corner, above the map footer */
.conflation-control {
  position: absolute;
  left: 12px;
  bottom: calc(2.5em + 12px);
  z-index: 10;
}

.conflation-panel {
  width: 18rem;
}
</style>
