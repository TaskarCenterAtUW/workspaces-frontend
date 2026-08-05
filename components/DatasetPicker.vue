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
      placeholder="Search released and accessible datasets..."
      aria-label="Dataset Selection"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="isOpen"
      aria-controls="dataset-picker-options"
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
          v-if="datasets.length > 0"
          class="dataset-count"
        >
          Showing first {{ datasets.length }} matching dataset{{ datasets.length !== 1 ? 's' : '' }}
          <span v-if="datasets.length === pageSize">&#183; Refine your search for more results</span>
        </span>
        <span
          v-if="loading"
          class="spinner-border spinner-border-sm ms-auto"
          role="status"
          aria-label="Loading datasets"
        />
      </div>

      <div
        ref="listRef"
        class="dataset-list-wrap"
      >
        <ul
          id="dataset-picker-options"
          class="list-group list-group-flush"
          role="listbox"
        >
          <li
            v-if="errorMessage && !loading"
            class="list-group-item text-danger"
          >
            {{ errorMessage }}
          </li>
          <li
            v-else-if="datasets.length === 0 && !loading"
            class="list-group-item text-muted"
          >
            No datasets found.
          </li>
          <li
            v-for="(dataset, index) in datasets"
            :id="`dataset-item-${index}`"
            :key="dataset.id"
            class="list-group-item list-group-item-action cursor-pointer"
            :class="{ 'highlighted': activeIndex === index, 'fw-bold': model === dataset.id }"
            role="option"
            :aria-selected="model === dataset.id"
            @click="selectDataset(dataset)"
            @mouseenter="activeIndex = index"
          >
            <div>{{ formatDataset(dataset) }}</div>
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
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { tdeiClient } from '~/services/index'
import type { TdeiDatasetSummary } from '~/types/tdei'

const pageSize = 10
const props = withDefaults(defineProps<{
  id?: string;
  disabled?: boolean;
  selectedDataset?: TdeiDatasetSummary;
}>(), {
  disabled: false,
  selectedDataset: undefined,
})
const model = defineModel<string | null>({ required: true })

const pickerRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const searchText = ref('')
const selectedText = ref('')
const datasets = ref<TdeiDatasetSummary[]>([])
const isOpen = ref(false)
const loading = ref(false)
const activeIndex = ref(-1)
const errorMessage = ref('')

let debounceId: ReturnType<typeof setTimeout>
let requestSequence = 0
let hasLoaded = false

function formatDataset(dataset: TdeiDatasetSummary) {
  return dataset.version
    ? `${dataset.name} (version ${dataset.version})`
    : dataset.name
}

watch(
  () => props.selectedDataset,
  (dataset) => {
    if (dataset && dataset.id === model.value) {
      selectedText.value = formatDataset(dataset)
      searchText.value = selectedText.value
    }
  },
  { immediate: true },
)

async function loadDatasets(name: string) {
  const requestId = ++requestSequence
  loading.value = true
  errorMessage.value = ''
  activeIndex.value = -1

  try {
    const results = await tdeiClient.getAvailableDatasetsByName(name, 1, pageSize)
    if (requestId === requestSequence) {
      datasets.value = results
      hasLoaded = true
    }
  } catch (error) {
    if (requestId === requestSequence) {
      datasets.value = []
      errorMessage.value = 'Unable to load datasets. Please try again.'
    }
    console.error(error)
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

function onInput() {
  model.value = null
  selectedText.value = ''
  isOpen.value = true
  requestSequence++
  datasets.value = []
  errorMessage.value = ''
  loading.value = true
  clearTimeout(debounceId)
  debounceId = setTimeout(() => loadDatasets(searchText.value.trim()), 300)
}

function selectDataset(dataset: TdeiDatasetSummary) {
  model.value = dataset.id
  selectedText.value = formatDataset(dataset)
  searchText.value = selectedText.value
  isOpen.value = false
}

function onFocus(event: FocusEvent) {
  isOpen.value = true
  if (!hasLoaded && !loading.value) loadDatasets('')
  ;(event.target as HTMLInputElement).select()
}

function closeDropdown() {
  isOpen.value = false
  if (model.value) searchText.value = selectedText.value
}

function onFocusOut(event: FocusEvent) {
  if (!pickerRef.value?.contains(event.relatedTarget as Node)) closeDropdown()
}

function scrollToActive() {
  nextTick(() => {
    const active = listRef.value?.querySelector(`#dataset-item-${activeIndex.value}`) as HTMLElement | null
    active?.scrollIntoView({ block: 'nearest' })
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown()
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    isOpen.value = true
    const direction = event.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = Math.min(
      datasets.value.length - 1,
      Math.max(0, activeIndex.value + direction),
    )
    scrollToActive()
    return
  }

  if (event.key === 'Enter' && isOpen.value && activeIndex.value >= 0) {
    event.preventDefault()
    const dataset = datasets.value[activeIndex.value]
    if (dataset) selectDataset(dataset)
  }
}

onUnmounted(() => clearTimeout(debounceId))
</script>

<style lang="scss" scoped>
@import "assets/scss/theme.scss";

.cursor-pointer {
  cursor: pointer;
}
.dataset-dropdown {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 0.375rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  z-index: 1000;
}
.dataset-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-bottom: 1px solid $gray-200;
  background: $gray-100;
  min-height: 30px;
}
.dataset-count {
  color: $gray-700;
  flex: 1;
  font-size: 0.74rem;
}
.dataset-list-wrap {
  max-height: 260px;
  overflow-y: auto;
}
.list-group-item.highlighted {
  background-color: rgba(13, 110, 253, 0.15);
  color: inherit;
}
</style>
