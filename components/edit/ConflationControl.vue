<template>
  <aside
    class="conflation-panel"
    aria-label="Conflation"
  >
    <h2 class="conflation-heading">
      Conflate a TDEI Dataset
    </h2>

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
        <div>TDEI dataset <strong class="text-break">{{ dataset.tdeiDatasetId }}</strong></div>
        <div class="conflation-hint">
          {{ dataset.edges }} edges, {{ dataset.nodes }} nodes
        </div>
        <div class="d-flex gap-3">
          <button
            type="button"
            class="btn btn-link btn-sm p-0"
            @click="zoomTo(dataset.bounds)"
          >
            Go to it
          </button>
          <button
            type="button"
            class="btn btn-link btn-sm p-0 link-danger"
            @click="remove"
          >
            Remove
          </button>
        </div>
      </section>

      <section
        class="conflation-section"
        aria-label="Review suggested edits"
      >
        <h2 class="conflation-heading">
          Review Suggested Edits
        </h2>
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

        <div
          class="btn-group btn-group-sm w-100 mb-2"
          role="group"
          aria-label="Direction to spiral out from the map centre"
        >
          <template
            v-for="option in ROTATIONS"
            :key="option.value"
          >
            <input
              :id="`conflation-rotation-${option.value}`"
              v-model="rotation"
              type="radio"
              class="btn-check"
              name="conflation-rotation"
              :value="option.value"
              :disabled="reviewing"
              @change="restart"
            >
            <label
              class="btn btn-outline-secondary"
              :for="`conflation-rotation-${option.value}`"
            >{{ option.label }}</label>
          </template>
        </div>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary w-100 mb-2"
          :disabled="reviewing"
          @click="restart"
        >
          Start from map centre
        </button>
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
// @test unit: "Go to it" centres the map on the dataset; "Remove" stops conflating it and brings the form back
// @test unit: total tiles, tiles reviewed and the progress bar follow the service's review counts as they change
// @test unit: Next and Previous step through pending suggestions spiralling out from the map centre, restarting with the chosen rotation on "Start from map centre" or a rotation change
// @test unit: the item under review shows what it would write and how it joins the workspace; Accept accepts it, Ignore ignores it and moves to the next

import type { ReviewItem, ReviewPosition, ReviewStats } from '~/services/conflation/rapid-service';
import type { Rotation } from '~/services/conflation/review';
import type { Bounds } from '~/services/conflation/suggestions';

const props = defineProps<{
  /** The conflation service (see services/conflation/rapid-service.ts). */
  service: {
    addDatasetAsync(id: string, proximity: number): Promise<{ datasetID: string; nodes: number; edges: number; bounds: Bounds }>;
    removeDataset(datasetID: string): void;
    startReview(datasetID: string, rotation: Rotation): void;
    reviewStepAsync(datasetID: string, direction: 1 | -1, onSearch?: (tile: number, tiles: number) => void): Promise<ReviewPosition>;
    reviewStats(datasetID: string): ReviewStats;
    currentItem(datasetID: string): ReviewItem | undefined;
    acceptCurrent(datasetID: string): void;
    ignoreCurrent(datasetID: string): void;
    on(event: 'reviewchange', listener: () => void): unknown;
    off(event: 'reviewchange', listener: () => void): unknown;
  };
  /** Rapid's map, to move to the dataset. */
  map?: { centerZoomEase(loc: [number, number], zoom: number): unknown };
}>();

const ITEM_TITLES: Record<ReviewItem['kind'], string> = {
  edge: 'New edge',
  tags: 'Tags to add',
  removed: 'Dropped edge'
};
const ROTATIONS: { value: Rotation; label: string }[] = [
  { value: 'clockwise', label: 'Clockwise' },
  { value: 'counterclockwise', label: 'Counterclockwise' }
];

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

const stats = ref<ReviewStats>({ tiles: 0, reviewed: 0 });
const item = ref<ReviewItem | undefined>();
const reviewing = ref(false);
const rotation = ref<Rotation>('clockwise');
const reviewStatus = ref('Press Next to step through the suggested edits, spiralling out from the map centre.');
/** Whether review has started (from the map centre at the time). */
let started = false;

function refresh() {
  const id = dataset.value?.datasetID;
  stats.value = id ? props.service.reviewStats(id) : { tiles: 0, reviewed: 0 };
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
    started = false;
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

function zoomTo([w, s, e, n]: Bounds) {
  props.map?.centerZoomEase([(w + e) / 2, (s + n) / 2], 17);
}

/** Starts review over from the map's current centre, with the chosen rotation. */
function restart() {
  if (!dataset.value) return;
  props.service.startReview(dataset.value.datasetID, rotation.value);
  started = true;
  reviewStatus.value = `Starting from the map centre, ${rotation.value}. Press Next.`;
  refresh();
}

async function step(direction: 1 | -1) {
  if (!dataset.value) return;
  if (!started) restart();
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
  reviewStatus.value = 'Accepted. It\'s selected for editing; press Next to continue.';
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
