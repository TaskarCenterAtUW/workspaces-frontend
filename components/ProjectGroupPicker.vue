<template>
  <div class="position-relative project-group-picker" ref="pickerRef">
    <input
      v-model="searchText"
      type="text"
      class="form-select"
      placeholder="Search project groups..."
      @focus="onFocus"
      @keydown="onKeydown"
    />
    <ul
      v-if="isOpen"
      ref="listRef"
      class="list-group position-absolute w-100 mt-1 shadow bg-white"
      style="z-index: 1000; max-height: 250px; overflow-y: auto;"
      @scroll="onScroll"
      @mousedown.prevent
    >
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
      <li v-if="loading" class="list-group-item text-center">
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { tdeiUserClient } from '~/services/index'

const model = defineModel({ required: true })
const searchText = ref('')
const isOpen = ref(false)
const projectGroups = ref<{ id: string; name: string }[]>([])
const selectedGroupName = ref('')
const loading = ref(false)
const pickerRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)

let pageNo = 1
let hasMore = true
const pageSize = 10

const loadGroups = async (reset = false) => {
  if (loading.value) return
  if (reset) {
    pageNo = 1
    hasMore = true
    projectGroups.value = []
    activeIndex.value = -1
  }
  if (!hasMore) return

  loading.value = true
  try {
    let query = searchText.value
    // If the text is exactly the selected group's name, fetch all options instead of filtering
    if (query === selectedGroupName.value) {
      query = ''
    }

    const newGroups = await tdeiUserClient.getMyProjectGroups(pageNo, query, pageSize)
    projectGroups.value.push(...newGroups)

    if (newGroups.length < pageSize) {
      hasMore = false
    } else {
      pageNo++
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

let timeoutId: ReturnType<typeof setTimeout>
watch(searchText, () => {
  if (!isOpen.value) return
  
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    loadGroups(true)
  }, 300)
})

watch(model, (newId) => {
  const pg = projectGroups.value.find(p => p.id === newId)
  if (pg && !isOpen.value) {
    searchText.value = pg.name
    selectedGroupName.value = pg.name
  }
})

const onScroll = (e: Event) => {
  const target = e.target as HTMLElement
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 10) {
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
  }
}

const onFocus = (e: Event) => {
  isOpen.value = true
  loadGroups(true)
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
    isOpen.value = false
    const pg = projectGroups.value.find(p => p.id === model.value)
    if (pg) {
      searchText.value = pg.name
      selectedGroupName.value = pg.name
    } else {
      searchText.value = ''
    }
  }
}

const handleClickOutside = (event: MouseEvent) => {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    if (isOpen.value) {
      isOpen.value = false
      const pg = projectGroups.value.find(p => p.id === model.value)
      if (pg) {
        searchText.value = pg.name
        selectedGroupName.value = pg.name
      } else {
        searchText.value = ''
      }
    }
  }
}

onMounted(async () => {
  document.addEventListener('mousedown', handleClickOutside)
  await loadGroups(true)
  
  if (projectGroups.value.length > 0) {
    if (!model.value || !projectGroups.value.some(pg => pg.id === model.value)) {
      model.value = projectGroups.value[0]?.id
    }
    const selected = projectGroups.value.find(pg => pg.id === model.value)
    if (selected) {
      searchText.value = selected.name
      selectedGroupName.value = selected.name
    }
  }
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
.list-group-item.highlighted {
  background-color: rgba(13, 110, 253, 0.25);
  color: inherit;
}
</style>
