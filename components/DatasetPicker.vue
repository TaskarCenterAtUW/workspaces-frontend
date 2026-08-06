<template>
  <div
    ref="pickerRef"
    class="position-relative dataset-picker"
    @focusout="onFocusOut"
  >
    <input
      :id="props.id"
      v-model="searchText"
      type="text"
      class="form-select"
      :disabled="props.disabled"
      :required="props.required"
      placeholder="Search released and accessible datasets..."
      aria-label="Dataset Selection"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="isOpen"
      :aria-controls="listboxId"
      :aria-activedescendant="activeOptionId"
      :aria-required="props.required"
      autocomplete="off"
      @focus="onFocus"
      @click="isOpen = true"
      @input="onInput"
      @keydown="onKeydown"
    >

    <div
      v-if="isOpen"
      class="dataset-dropdown position-absolute w-100 mt-1"
      @mousedown.prevent
    >
      <div class="dataset-header">
        <span
          v-if="datasetOptions.length > 0"
          class="dataset-count"
        >
          {{ resultSummary }}
        </span>
        <span
          v-if="loading"
          class="spinner-border spinner-border-sm ms-auto"
          aria-hidden="true"
        />
      </div>

      <span
        class="visually-hidden"
        role="status"
        aria-live="polite"
      >{{ statusMessage }}</span>

      <div class="dataset-list-wrap">
        <p
          v-if="errorMessage && !loading"
          class="list-group-item text-danger mb-0"
        >
          {{ errorMessage }}
        </p>
        <p
          v-else-if="datasetOptions.length === 0 && !loading"
          class="list-group-item text-muted mb-0"
        >
          No datasets found.
        </p>

        <ul
          :id="listboxId"
          class="list-group list-group-flush"
          role="listbox"
          :aria-busy="loading"
        >
          <li
            v-for="(dataset, index) in datasetOptions"
            :id="getOptionId(index)"
            :key="dataset.id"
            class="list-group-item list-group-item-action cursor-pointer"
            :class="{ 'highlighted': activeIndex === index, 'fw-bold': model === dataset.id }"
            role="option"
            :aria-selected="model === dataset.id"
            @click="selectDataset(dataset)"
            @mouseenter="activeIndex = index"
          >
            <div>{{ dataset.displayName }}</div>
            <small
              v-if="dataset.projectGroupName"
              class="text-muted"
            >Source project group: {{ dataset.projectGroupName }}</small>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useId, watch } from 'vue';
import { tdeiClient } from '~/services/index';
import type { TdeiDatasetSummary } from '~/types/tdei';

interface DatasetOption extends TdeiDatasetSummary {
  displayName: string;
}

const pageSize = 10;
const props = withDefaults(defineProps<{
  id?: string;
  disabled?: boolean;
  required?: boolean;
  selectedDataset?: TdeiDatasetSummary;
}>(), {
  disabled: false,
  required: false,
  selectedDataset: undefined
});
const model = defineModel<string | null>({ required: true });

const generatedId = useId();
const listboxId = computed(() => `${props.id || `dataset-picker-${generatedId}`}-options`);
const pickerRef = ref<HTMLElement | null>(null);
const searchText = ref('');
const selectedText = ref('');
const datasets = ref<TdeiDatasetSummary[]>([]);
const isOpen = ref(false);
const loading = ref(false);
const activeIndex = ref(-1);
const errorMessage = ref('');

const datasetOptions = computed<DatasetOption[]>(() => datasets.value.map(dataset => ({
  ...dataset,
  displayName: formatDataset(dataset)
})));
const activeOptionId = computed(() => isOpen.value && activeIndex.value >= 0
  ? getOptionId(activeIndex.value)
  : undefined);
const resultSummary = computed(() => {
  const count = datasetOptions.value.length;
  const prefix = count === pageSize ? 'Showing first' : 'Showing';
  const summary = `${prefix} ${count} matching dataset${count === 1 ? '' : 's'}`;

  return count === pageSize
    ? `${summary} · Refine your search for more results`
    : summary;
});
const statusMessage = computed(() => {
  if (loading.value) {
    return 'Loading datasets.';
  }

  if (errorMessage.value) {
    return errorMessage.value;
  }

  if (!hasLoaded.value) {
    return '';
  }

  return datasetOptions.value.length > 0
    ? resultSummary.value
    : 'No datasets found.';
});

let debounceId: ReturnType<typeof setTimeout>;
let requestSequence = 0;
const hasLoaded = ref(false);
let requestAbortController: AbortController | undefined;

function formatDataset(dataset: TdeiDatasetSummary) {
  return dataset.version
    ? `${dataset.name} (version ${dataset.version})`
    : dataset.name;
}

function getOptionId(index: number) {
  return `${listboxId.value}-option-${index}`;
}

watch(
  () => props.selectedDataset,
  (dataset) => {
    if (dataset && dataset.id === model.value) {
      selectedText.value = formatDataset(dataset);
      searchText.value = selectedText.value;
    }
  },
  { immediate: true }
);

async function loadDatasets(name: string) {
  requestAbortController?.abort();
  const abortController = new AbortController();
  requestAbortController = abortController;
  const requestId = ++requestSequence;
  const client = tdeiClient.clone(abortController.signal);
  loading.value = true;
  errorMessage.value = '';
  activeIndex.value = -1;

  try {
    const results = await client.getAvailableDatasetsByName(name, 1, pageSize);
    if (requestId === requestSequence) {
      datasets.value = results;
      hasLoaded.value = true;
    }
  }
  catch (error) {
    if (abortController.signal.aborted) {
      return;
    }

    if (requestId === requestSequence) {
      datasets.value = [];
      errorMessage.value = 'Unable to load datasets. Please try again.';
    }
    console.error(error);
  }
  finally {
    if (requestId === requestSequence) {
      loading.value = false;
    }
  }
}

function onInput() {
  model.value = null;
  selectedText.value = '';
  isOpen.value = true;
  requestAbortController?.abort();
  requestSequence++;
  datasets.value = [];
  errorMessage.value = '';
  loading.value = true;
  clearTimeout(debounceId);
  debounceId = setTimeout(() => loadDatasets(searchText.value.trim()), 300);
}

function selectDataset(dataset: TdeiDatasetSummary) {
  model.value = dataset.id;
  selectedText.value = formatDataset(dataset);
  searchText.value = selectedText.value;
  isOpen.value = false;
}

function onFocus(event: FocusEvent) {
  isOpen.value = true;
  if (!hasLoaded.value && !loading.value) {
    void loadDatasets('');
  }
  (event.target as HTMLInputElement).select();
}

function closeDropdown() {
  isOpen.value = false;
  searchText.value = model.value ? selectedText.value : '';
}

function onFocusOut(event: FocusEvent) {
  if (!pickerRef.value?.contains(event.relatedTarget as Node)) {
    closeDropdown();
  }
}

function scrollToActive() {
  nextTick(() => {
    const active = document.getElementById(getOptionId(activeIndex.value));
    active?.scrollIntoView({ block: 'nearest' });
  });
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDropdown();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    isOpen.value = true;
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    activeIndex.value = Math.min(
      datasets.value.length - 1,
      Math.max(0, activeIndex.value + direction)
    );
    scrollToActive();
    return;
  }

  if (event.key === 'Enter' && isOpen.value && activeIndex.value >= 0) {
    event.preventDefault();
    const dataset = datasets.value[activeIndex.value];
    if (dataset) {
      selectDataset(dataset);
    }
  }
}

onUnmounted(() => {
  clearTimeout(debounceId);
  requestSequence++;
  requestAbortController?.abort();
});
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

$dataset-picker-list-max-height: 16.25rem;

.cursor-pointer {
  cursor: pointer;
}

.dataset-dropdown {
  background: $dropdown-bg;
  border: $dropdown-border-width solid $dropdown-border-color;
  border-radius: $dropdown-border-radius;
  box-shadow: $box-shadow;
  overflow: hidden;
  z-index: $zindex-dropdown;
}

.dataset-header {
  display: flex;
  align-items: center;
  gap: $spacer * 0.5;
  padding: $spacer * 0.25 $spacer * 0.75;
  border-bottom: 1px solid $gray-200;
  background: $gray-100;
}

.dataset-count {
  flex: 1;
  color: $gray-700;
  font-size: $small-font-size;
  line-height: $line-height-sm;
}

.dataset-list-wrap {
  max-height: $dataset-picker-list-max-height;
  overflow-y: auto;
}

.list-group-item.highlighted {
  background-color: $dropdown-active-bg;
  color: inherit;
}
</style>
