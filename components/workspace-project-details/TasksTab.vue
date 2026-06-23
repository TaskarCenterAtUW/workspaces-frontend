<template>
  <section class="project-detail-card project-detail-task-card">
    <div class="project-detail-task-toolbar">
      <div class="project-detail-task-search">
        <label class="visually-hidden" for="project-detail-task-search">Search tasks by id</label>
        <input
          id="project-detail-task-search"
          v-model.trim="searchQuery"
          class="form-control"
          type="search"
          placeholder="Search tasks by id"
        >
        <span class="project-detail-task-search-icon" aria-hidden="true">
          <app-icon variant="search" size="20" no-margin />
        </span>
      </div>

      <div class="project-detail-task-filter">
        <span>Status</span>
        <app-select
          id="project-detail-task-status"
          v-model="selectedStatus"
          :options="statusOptions"
          :aria-label="'Filter tasks by status'"
        />
      </div>

      <div class="project-detail-task-filter">
        <span>Sort By</span>
        <app-select
          id="project-detail-task-sort"
          v-model="sortBy"
          :options="sortOptions"
          :aria-label="'Sort tasks'"
        />
      </div>
    </div>

    <div class="project-detail-task-list-wrap">
      <div v-if="paginatedTasks.length > 0" class="project-detail-task-list-header" aria-hidden="true">
        <span>Task ID</span>
        <span>Status</span>
        <span>Mapper</span>
        <span>Last Updated</span>
      </div>

      <ul v-if="paginatedTasks.length > 0" class="project-detail-task-list">
        <li
          v-for="task in paginatedTasks"
          :key="task.id"
          class="project-detail-task-item"
          :class="{ 'project-detail-task-item-selected': task.id === selectedTaskId }"
        >
          <div class="project-detail-task-cell project-detail-task-cell-id">
            <span class="project-detail-task-mobile-label">Task ID</span>
            <div class="project-detail-task-id-copy">
              <button
                class="project-detail-task-select"
                type="button"
                @click="emit('select-task', task.id)"
              >
                <strong>{{ task.label }}</strong>
              </button>

              <workspace-project-details-task-lock-control
                v-if="task.locked"
                :busy="mutatingTaskNumber === task.taskNumber"
                :can-unlock="task.lock?.user_id === currentUserId"
                :locked-by-name="task.lock?.user_name ?? null"
                @unlock="emit('unlock-task', task.taskNumber)"
              />
            </div>
          </div>

          <div class="project-detail-task-cell">
            <span class="project-detail-task-mobile-label">Status</span>
            <span class="project-detail-task-status">
              <span class="project-detail-task-status-swatch" :class="`project-detail-task-status-${task.status}`" />
              {{ formatTaskStatus(task.status) }}
            </span>
          </div>

          <div class="project-detail-task-cell">
            <span class="project-detail-task-mobile-label">Mapper</span>
            <span class="project-detail-task-value">{{ task.mapperName }}</span>
          </div>

          <div class="project-detail-task-cell">
            <span class="project-detail-task-mobile-label">Last Updated</span>
            <span class="project-detail-task-value">{{ task.updatedAt }}</span>
          </div>
        </li>
      </ul>

      <p v-else class="project-detail-task-empty">
        No tasks match these filters.
      </p>
    </div>

    <footer class="project-detail-task-footer">
      <p>{{ paginationSummary }}</p>

      <nav class="project-detail-task-pagination" aria-label="Tasks pagination">
        <button
          type="button"
          :disabled="currentPage === 1"
          aria-label="Previous page"
          @click="currentPage -= 1"
        >
          <app-icon variant="chevron_left" size="22" no-margin />
        </button>

        <button
          v-for="page in totalPages"
          :key="page"
          type="button"
          :class="{ 'project-detail-task-pagination-active': page === currentPage }"
          :aria-current="page === currentPage ? 'page' : undefined"
          @click="currentPage = page"
        >
          {{ page }}
        </button>

        <button
          type="button"
          :disabled="currentPage === totalPages"
          aria-label="Next page"
          @click="currentPage += 1"
        >
          <app-icon variant="chevron_right" size="22" no-margin />
        </button>
      </nav>
    </footer>
  </section>
</template>

<script setup lang="ts">
/**
 * TasksTab.vue
 *
 * Displays the paginated, filterable, sortable list of project tasks.
 * All filtering/sorting/pagination happens client-side — the full task list is passed
 * in as a prop and this component applies the transformations locally.
 *
 * Data pipeline:
 *   props.tasks → filteredTasks (search + status) → sortedTasks → paginatedTasks (rendered)
 *
 * Emits `select-task` when a task row is clicked, so the parent page can highlight it on the map.
 */
import type { WorkspaceProjectTaskListItem, WorkspaceProjectTaskStatus } from '~/types/projects';

type TaskSortOption = 'latest' | 'oldest' | 'task_asc' | 'task_desc';
type TaskStatusFilter = WorkspaceProjectTaskStatus | 'all';

interface SelectOption {
  label: string;
  value: string;
}

interface Props {
  /** Auth subject of the signed-in user. Used to decide whether a lock can be unlocked locally. */
  currentUserId?: string | null;
  /** Task number currently being locked/unlocked so only the affected row shows a busy state. */
  mutatingTaskNumber?: number | null;
  /** The task ID currently highlighted on the map (synced from the parent page). */
  selectedTaskId?: string | null;
  /** Full list of tasks for this project. Filtering/sorting is applied in this component. */
  tasks: WorkspaceProjectTaskListItem[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'select-task': [taskId: string];
  'unlock-task': [taskNumber: number];
}>();

/** Number of tasks shown per page. Change this if you want larger or smaller pages. */
const pageSize = 5;
const searchQuery = ref('');
const selectedStatus = ref<TaskStatusFilter>('all');
const sortBy = ref<TaskSortOption>('latest');
const currentPage = ref(1);

const statusOptions: SelectOption[] = [
  { label: 'All', value: 'all' },
  { label: 'Ready for mapping', value: 'ready_for_mapping' },
  { label: 'Ready for validation', value: 'ready_for_validation' },
  { label: 'More mapping needed', value: 'needs_more_mapping' },
  { label: 'Completed', value: 'completed' },
];

const sortOptions: SelectOption[] = [
  { label: 'Latest', value: 'latest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Task ID A-Z', value: 'task_asc' },
  { label: 'Task ID Z-A', value: 'task_desc' },
];

/**
 * Step 1 — Filter: apply the search query and status filter.
 * Search matches against the human-readable label ("Task #3"), the raw ID, and the task number.
 * An empty search query matches everything, so no conditional logic is needed in the template.
 */
const filteredTasks = computed(() => {
  const normalizedSearch = searchQuery.value.toLowerCase();

  return props.tasks.filter((task) => {
    const matchesSearch = !normalizedSearch
      || task.label.toLowerCase().includes(normalizedSearch)
      || task.id.toLowerCase().includes(normalizedSearch)
      || String(task.taskNumber).includes(normalizedSearch);

    const matchesStatus = selectedStatus.value === 'all' || task.status === selectedStatus.value;

    return matchesSearch && matchesStatus;
  });
});

/**
 * Step 2 — Sort: apply the selected sort order to the filtered list.
 * We spread into a new array before calling `.sort()` because `.sort()` mutates in place,
 * and mutating the computed output directly would cause Vue reactivity issues.
 * 'latest' keeps the default order from the API (already descending by date).
 */
const sortedTasks = computed(() => {
  const tasks = [...filteredTasks.value];

  switch (sortBy.value) {
    case 'oldest':
      return tasks.reverse();
    case 'task_asc':
      return tasks.sort((a, b) => a.taskNumber - b.taskNumber);
    case 'task_desc':
      return tasks.sort((a, b) => b.taskNumber - a.taskNumber);
    case 'latest':
    default:
      return tasks;
  }
});

/** `Math.max(1, ...)` ensures totalPages is always at least 1, so the pagination never shows "0 pages". */
const totalPages = computed(() => Math.max(1, Math.ceil(sortedTasks.value.length / pageSize)));

/** Step 3 — Paginate: slice the sorted list down to the current page window. */
const paginatedTasks = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return sortedTasks.value.slice(start, start + pageSize);
});

/** Human-readable "Showing X to Y of Z entries" summary shown in the footer. */
const paginationSummary = computed(() => {
  if (sortedTasks.value.length === 0) {
    return 'Showing 0 entries';
  }

  const start = (currentPage.value - 1) * pageSize + 1;
  const end = start + paginatedTasks.value.length - 1;

  return `Showing ${start} to ${end} of ${sortedTasks.value.length} entries`;
});

/**
 * Reset to page 1 whenever the user changes the search, status filter, or sort.
 * Without this, the user could be on page 3 and change the filter to show only 2 tasks,
 * resulting in an empty list with no navigation back.
 */
watch([searchQuery, selectedStatus, sortBy], () => {
  currentPage.value = 1;
});

/**
 * If the total number of pages shrinks (e.g. user deletes tasks), snap back to the last
 * valid page so we don't show an empty list with no indication of why.
 */
watch(totalPages, (pageCount) => {
  if (currentPage.value > pageCount) {
    currentPage.value = pageCount;
  }
});

/**
 * Convert the internal API status string to a display-friendly label.
 * If you add a new status value to `WorkspaceProjectTaskStatus`, add a case here too.
 */
function formatTaskStatus(status: WorkspaceProjectTaskStatus) {
  switch (status) {
    case 'ready_for_validation':
      return 'Ready for validation';
    case 'needs_more_mapping':
      return 'More mapping needed';
    case 'completed':
      return 'Completed';
    case 'ready_for_mapping':
    default:
      return 'Ready for mapping';
  }
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-detail-card {
  padding: 1.5rem;
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 1rem;
  box-shadow: 0 0.75rem 2rem rgba($text-navy, 0.08);
}

.project-detail-task-card {
  container-type: inline-size;
}

.project-detail-task-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(8.75rem, 0.78fr) minmax(8.75rem, 0.78fr);
  gap: 0.85rem;
  align-items: end;
  margin-bottom: 1rem;
}

.project-detail-task-search {
  position: relative;
}

.project-detail-task-search .form-control {
  min-height: 2.85rem;
  padding-right: 2.9rem;
}

.project-detail-task-search-icon {
  position: absolute;
  right: 0.9rem;
  top: 50%;
  color: #858cab;
  transform: translateY(-50%);
}

.project-detail-task-filter {
  display: grid;
  gap: 0.35rem;
}

.project-detail-task-filter span {
  color: #1a1e3d;
  font-size: 0.9rem;
  font-weight: 600;
}

.project-detail-card :deep(.tdei-select-toggle),
.project-detail-card :deep(.tdei-select-menu) {
  border-radius: 0.75rem;
}

.project-detail-task-list-wrap {
  display: grid;
  gap: 0;
  border: 1px solid rgba($text-navy, 0.08);
  border-radius: 0.85rem;
  overflow: hidden;
}

.project-detail-task-list-header,
.project-detail-task-item {
  display: grid;
  grid-template-columns: minmax(8.5rem, 1fr) minmax(12rem, 1.55fr) minmax(9rem, 1fr) minmax(7.75rem, 0.95fr);
  gap: 0.9rem;
}

.project-detail-task-list-header {
  padding: 1rem 1.35rem 0.95rem;
  color: #6e7490;
  font-size: 0.88rem;
  font-weight: 700;
  background: #f7f8fc;
}

.project-detail-task-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-detail-task-item {
  align-items: center;
  padding: 1.1rem 1.35rem;
  background: #ffffff;
  border-top: 1px solid rgba($text-navy, 0.08);
}

.project-detail-task-item-selected {
  background: rgba(214, 233, 250, 0.42);
}

.project-detail-task-cell {
  min-width: 0;
}

.project-detail-task-select {
  width: auto;
  display: grid;
  gap: 0.2rem;
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}

.project-detail-task-select:hover strong,
.project-detail-task-select:focus-visible strong {
  color: #214d85;
}

.project-detail-task-cell-id strong {
  color: #1a1e3d;
  font-size: 0.95rem;
  font-weight: 700;
}

.project-detail-task-id-copy {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.project-detail-task-status {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #37405d;
  line-height: 1.35;
}

.project-detail-task-status-swatch {
  width: 0.95rem;
  height: 0.95rem;
  flex-shrink: 0;
  border: 1px solid rgba(90, 96, 123, 0.12);
}

.project-detail-task-status-ready_for_mapping {
  background: #fde9aa;
}

.project-detail-task-status-ready_for_validation {
  background: #a8d8f8;
}

.project-detail-task-status-needs_more_mapping {
  background: #f8be90;
}

.project-detail-task-status-completed {
  background: #aae8cd;
}

.project-detail-task-value {
  display: inline-block;
  color: #37405d;
  line-height: 1.35;
  word-break: break-word;
}

.project-detail-task-mobile-label {
  display: none;
  margin-bottom: 0.28rem;
  color: #6e7490;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.project-detail-task-empty {
  margin: 0;
  padding: 1.25rem;
  color: #5a607b;
  text-align: center;
}

.project-detail-task-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1rem;
}

.project-detail-task-footer p {
  margin: 0;
  color: #5a607b;
  font-size: 0.95rem;
}

.project-detail-task-pagination {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.project-detail-task-pagination button {
  width: 2.15rem;
  height: 2.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #59607a;
  background: transparent;
  border: 0;
  border-radius: 0.45rem;
}

.project-detail-task-pagination-active {
  color: #ffffff !important;
  background: $primary !important;
}

.project-detail-task-pagination button:disabled {
  opacity: 0.45;
}

@container (max-width: 640px) {
  .project-detail-task-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .project-detail-task-search {
    grid-column: 1 / -1;
  }
}

@container (max-width: 560px) {
  .project-detail-task-toolbar {
    grid-template-columns: 1fr;
  }

  .project-detail-task-search {
    grid-column: auto;
  }

  .project-detail-task-list-header {
    display: none;
  }

  .project-detail-task-item {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    padding-top: 1rem;
    padding-bottom: 1rem;
  }

  .project-detail-task-mobile-label {
    display: block;
  }

  .project-detail-task-empty {
    text-align: left;
  }

  .project-detail-task-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}

@container (max-width: 420px) {
  .project-detail-task-item {
    grid-template-columns: 1fr;
  }
}

@include media-breakpoint-down(sm) {
  .project-detail-card {
    padding: 1rem;
  }

  .project-detail-task-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
