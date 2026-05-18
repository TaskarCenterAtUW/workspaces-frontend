<template>
  <div class="position-relative project-group-picker" ref="pickerRef" @focusout="onFocusOut">
    <input
      v-model="searchText"
      type="text"
      class="form-select"
      :disabled="props.disabled"
      placeholder="Search project groups..."
      @focus="onFocus"
      @click="onInputClick"
      @input="onInput"
      @keydown="onKeydown"
    />
    <div
      v-if="isOpen"
      class="pg-dropdown position-absolute w-100 mt-1"
      @mousedown.prevent
    >
      <div class="pg-header">
        <span v-if="projectGroups.length > 0" class="pg-count">
          <template v-if="totalCount !== undefined">
            Showing first {{ projectGroups.length }} of {{ totalCount }} project groups
            <span v-if="hasMore && !loading" class="pg-scroll-hint">&#183; Scroll to continue loading</span>
          </template>
          <template v-else-if="!hasMore">Showing all {{ projectGroups.length }} project group{{ projectGroups.length !== 1 ? 's' : '' }}</template>
          <template v-else>
            Showing first {{ projectGroups.length }} results
            <span v-if="!loading" class="pg-scroll-hint">&#183; Scroll to continue loading</span>
          </template>
        </span>
        <span v-if="loading" class="spinner-border spinner-border-sm ms-auto" role="status" aria-hidden="true"></span>
      </div>
      <div
        class="pg-list-wrap"
        :class="{ 'pg-has-more': hasMore && !loading }"
        ref="listRef"
        @scroll="onScroll"
      >
        <ul class="list-group list-group-flush">
          <li
            v-if="projectGroups.length === 0 && !loading"
            class="list-group-item text-muted"
          >
            No project groups found.
          </li>
          <li
            v-for="(pg, index) in projectGroups"
            :key="pg.id"
            :id="'pg-item-' + index"
            class="list-group-item list-group-item-action cursor-pointer"
            :class="{ highlighted: activeIndex === index, 'fw-bold': model === pg.id }"
            @click="selectGroup(pg.id)"
            @mouseenter="activeIndex = index"
          >
            {{ pg.name }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
const STORAGE_KEY_PROJECT_GROUP = 'tdei-selected-project-group'

function loadCachedName(id: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PROJECT_GROUP)
    if (!raw) return undefined
    const stored = JSON.parse(raw) as { id: string; name: string }
    return stored.id === id ? stored.name : undefined
  } catch {
    return undefined
  }
}

function persistCachedName(id: string, name: string) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY_PROJECT_GROUP, JSON.stringify({ id, name }))
  } catch { /* silently fail */ }
}
</script>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { tdeiUserClient } from '~/services/index'

const props = withDefaults(defineProps<{ disabled?: boolean }>(), {
  disabled: false,
})

const model = defineModel({ required: true })
const searchText = ref('')
const isOpen = ref(false)
const projectGroups = ref<{ id: string; name: string }[]>([])
const selectedGroupName = ref('')
const loading = ref(false)
const totalCount = ref<number | undefined>(undefined)
const pickerRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)

let pageNo = 1
const hasMore = ref(true)
let pendingReset = false
const pageSize = 10
let hasUnfilteredResults = false

const loadGroups = async (reset = false) => {
  if (loading.value) {
    pendingReset = pendingReset || reset
    return
  }

  if (reset) {
    pageNo = 1
    hasMore.value = true
    projectGroups.value = []
    activeIndex.value = -1
    totalCount.value = undefined
  }
  if (!hasMore.value) return

  loading.value = true
  try {
    let query = searchText.value
    // If the text is exactly the selected group's name, fetch all options instead of filtering
    if (query === selectedGroupName.value) {
      query = ''
    }
    if (reset) {
      hasUnfilteredResults = query === ''
    }

    const { items: newGroups, total } = await tdeiUserClient.getMyProjectGroups(pageNo, query, pageSize)
    if (total !== undefined) totalCount.value = total
    projectGroups.value.push(...newGroups)
    const selected = newGroups.find(g => g.id === model.value)
    if (selected) persistCachedName(selected.id, selected.name)

    if (newGroups.length < pageSize) {
      hasMore.value = false
    } else {
      pageNo++
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false

    if (pendingReset) {
      const resetNext = pendingReset
      pendingReset = false
      await loadGroups(resetNext)
    }
  }
}

let timeoutId: ReturnType<typeof setTimeout>

const onInputClick = () => {
  if (!isOpen.value) {
    isOpen.value = true
    if (!hasUnfilteredResults || projectGroups.value.length === 0) {
      loadGroups(true)
    }
  }
}

const onInput = () => {
  isOpen.value = true
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    loadGroups(true)
  }, 300)
}

watch(model, (newId) => {
  const pg = projectGroups.value.find(p => p.id === newId)
  if (pg && !isOpen.value) {
    searchText.value = pg.name
    selectedGroupName.value = pg.name
  }
})

const onScroll = (e: Event) => {
  const target = e.target as HTMLElement
  if (target.scrollTop + target.clientHeight >= target.scrollHeight * 0.8) {
    loadGroups()
  }
}

const selectGroup = (id: string) => {
  model.value = id
  isOpen.value = false
  const pg = projectGroups.value.find(p => p.id === id)
  if (pg) {
    searchText.value = pg.name
    selectedGroupName.value = pg.name
    persistCachedName(pg.id, pg.name)
  }
}

const onFocus = (e: Event) => {
  isOpen.value = true
  if (!hasUnfilteredResults || projectGroups.value.length === 0) {
    loadGroups(true)
  }
  const target = e.target as HTMLInputElement
  if (target) {
    target.select()
  }
}

const scrollToActive = () => {
  nextTick(() => {
    if (!listRef.value || activeIndex.value < 0) return
    const activeEl = listRef.value.querySelector(`#pg-item-${activeIndex.value}`) as HTMLElement
    if (activeEl) {
      const list = listRef.value
      const top = activeEl.offsetTop
      const bottom = top + activeEl.offsetHeight

      if (top < list.scrollTop) {
        list.scrollTop = top
      } else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight
      }
    }
  })
}

const onKeydown = (e: KeyboardEvent) => {
  if (!isOpen.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      onFocus(e)
      e.preventDefault()
    }
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (activeIndex.value < projectGroups.value.length - 1) {
      activeIndex.value++
      scrollToActive()
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (activeIndex.value > 0) {
      activeIndex.value--
      scrollToActive()
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIndex.value >= 0 && activeIndex.value < projectGroups.value.length) {
      const pg = projectGroups.value[activeIndex.value]
      if (pg) selectGroup(pg.id)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeDropdown()
  }
}

const applyCachedName = () => {
  const cached = loadCachedName(model.value as string) ?? ''
  searchText.value = cached
  selectedGroupName.value = cached
}

const closeDropdown = () => {
  isOpen.value = false
  const pg = projectGroups.value.find(p => p.id === model.value)
  const name = pg?.name ?? selectedGroupName.value
  searchText.value = name
  if (pg) selectedGroupName.value = name
}

const onFocusOut = (e: FocusEvent) => {
  if (!pickerRef.value?.contains(e.relatedTarget as Node)) {
    if (isOpen.value) closeDropdown()
  }
}

onMounted(async () => {
  // Show cached name immediately before the API call completes
  if (model.value && loadCachedName(model.value as string)) {
    applyCachedName()
  }

  await loadGroups(true)

  if (projectGroups.value.length > 0) {
    const selected = projectGroups.value.find(pg => pg.id === model.value)
    if (selected) {
      searchText.value = selected.name
      selectedGroupName.value = selected.name
    } else if (model.value && loadCachedName(model.value as string)) {
      // Group is beyond page 1 — use the cached name for display
      applyCachedName()
    } else if (model.value) {
      // model is set but name is unknown — paginate until the group is found
      while (hasMore.value) {
        await loadGroups()
        const found = projectGroups.value.find(pg => pg.id === model.value)
        if (found) {
          searchText.value = found.name
          selectedGroupName.value = found.name
          break
        }
      }
    } else if (!model.value) {
      const first = projectGroups.value[0]!
      model.value = first.id
      searchText.value = first.name
      selectedGroupName.value = first.name
    }
  }
})

onUnmounted(() => {
  clearTimeout(timeoutId)
})
</script>

<style lang="scss" scoped>
@import "assets/scss/theme.scss";

.cursor-pointer {
  cursor: pointer;
}
.pg-dropdown {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 0.375rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  z-index: 1000;
}
.pg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-bottom: 1px solid $gray-200;
  background: $gray-100;
  min-height: 30px;
}
.pg-count {
  font-size: 0.74rem;
  color: $gray-700;
  flex: 1;
}
.pg-scroll-hint {
  color: $primary;
}
.pg-list-wrap {
  position: relative;
  max-height: 220px;
  overflow-y: auto;
}
.pg-list-wrap.pg-has-more::after {
  content: '';
  display: block;
  position: sticky;
  bottom: 0;
  height: 44px;
  margin-top: -44px;
  background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.95));
  pointer-events: none;
}
.list-group-item.highlighted {
  background-color: rgba(13, 110, 253, 0.15);
  color: inherit;
}
</style>
