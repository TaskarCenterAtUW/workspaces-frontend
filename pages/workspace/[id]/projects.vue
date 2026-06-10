<template>
  <app-page class="workspace-projects-page">
    <section class="workspace-projects-header">
      <h1 class="page-header-title workspace-projects-title">
        {{ workspace.title }} &gt; Projects
      </h1>
      <p class="page-header-subtitle tdei-page-subtitle-body">
        {{ projectGroupLabel }}
      </p>
    </section>

    <section class="workspace-projects-toolbar">
      <div class="workspace-projects-filters">
        <div class="workspace-projects-search">
          <label class="visually-hidden" for="workspace-project-search">Search Projects</label>
          <input
            id="workspace-project-search"
            v-model.trim="searchQuery"
            class="form-control workspace-projects-search-input"
            type="search"
            placeholder="Search Projects"
          >
          <span class="workspace-projects-search-icon" aria-hidden="true">
            <app-icon variant="search" size="22" no-margin />
          </span>
        </div>

        <div class="workspace-projects-filter-group">
          <span class="tdei-inline-filter-label">Status</span>
          <app-select
            id="workspace-project-status"
            v-model="selectedStatus"
            :aria-label="'Filter projects by status'"
            :options="statusOptions"
          />
        </div>

        <div class="workspace-projects-filter-group">
          <span class="tdei-inline-filter-label">Sort By</span>
          <app-select
            id="workspace-project-sort"
            v-model="sortBy"
            :aria-label="'Sort projects'"
            :options="sortOptions"
          />
        </div>
      </div>

      <div class="workspace-projects-toolbar-actions">
        <div class="workspace-projects-view-toggle" role="group" aria-label="Project layout">
          <button
            v-for="option in viewOptions"
            :key="option.value"
            class="workspace-projects-view-button"
            :class="{ 'workspace-projects-view-button-active': option.value === viewMode }"
            type="button"
            :aria-pressed="option.value === viewMode"
            @click="viewMode = option.value"
          >
            <app-icon :variant="option.icon" size="20" no-margin />
            <span class="visually-hidden">{{ option.label }}</span>
          </button>
        </div>

        <span class="workspace-projects-toolbar-divider" aria-hidden="true" />

        <button class="btn btn-primary workspace-projects-create-button" type="button">
          <app-icon variant="add" size="22" />
          New Project
        </button>
      </div>
    </section>

    <p class="visually-hidden" aria-live="polite">
      {{ liveRegionSummary }}
    </p>

    <section v-if="projects.length > 0" class="workspace-projects-results">
      <div v-if="viewMode === 'grid'" class="workspace-projects-grid">
        <workspace-projects-project-card
          v-for="project in projects"
          :key="project.id"
          :project="project"
        />
      </div>

      <div v-else class="workspace-projects-list">
        <workspace-projects-project-list-row
          v-for="project in projects"
          :key="project.id"
          :project="project"
        />
      </div>
    </section>

    <section v-else class="workspace-projects-empty-state">
      <p class="workspace-projects-empty-title">
        No projects match these filters.
      </p>
      <button class="btn btn-outline-secondary" type="button" @click="resetFilters">
        Reset Filters
      </button>
    </section>

    <section v-if="pagination.total > 0" class="workspace-projects-footer">
      <p class="workspace-projects-footer-copy">
        {{ paginationSummary }}
      </p>

      <nav class="workspace-projects-pagination" aria-label="Projects pagination">
        <button
          class="workspace-projects-pagination-arrow"
          type="button"
          :disabled="currentPage === 1"
          aria-label="Previous page"
          @click="goToPage(currentPage - 1)"
        >
          <app-icon variant="chevron_left" size="24" no-margin />
        </button>

        <button
          v-for="pageNumber in pageNumbers"
          :key="pageNumber"
          class="workspace-projects-pagination-number"
          :class="{ 'workspace-projects-pagination-number-active': pageNumber === currentPage }"
          type="button"
          :aria-current="pageNumber === currentPage ? 'page' : undefined"
          @click="goToPage(pageNumber)"
        >
          {{ pageNumber }}
        </button>

        <button
          class="workspace-projects-pagination-arrow"
          type="button"
          :disabled="currentPage === totalPages"
          aria-label="Next page"
          @click="goToPage(currentPage + 1)"
        >
          <app-icon variant="chevron_right" size="24" no-margin />
        </button>
      </nav>
    </section>
  </app-page>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading';
import { tdeiUserClient, workspaceProjectsClient, workspacesClient } from '~/services/index';

import type {
  WorkspaceProjectsQuery,
  WorkspaceProjectsResult,
  WorkspaceProjectSort,
  WorkspaceProjectStatus,
  WorkspaceProjectView,
} from '~/types/projects';

type StatusFilter = WorkspaceProjectStatus | 'all';

interface SelectOption {
  label: string;
  value: string;
}

const route = useRoute();
const workspaceId = Number(route.params.id);
const projectsLoading = reactive(new LoadingContext());

const [workspace, { items: projectGroups }] = await Promise.all([
  workspacesClient.getWorkspace(workspaceId),
  tdeiUserClient.getMyProjectGroups(1, '', 10000),
]);

const emptyProjectsResponse: WorkspaceProjectsResult = {
  results: [],
  pagination: {
    page: 1,
    pageSize: workspaceProjectsClient.getPageSize(),
    total: 0,
  },
};

const projectsResponse = ref<WorkspaceProjectsResult>(emptyProjectsResponse);

const searchQuery = ref('');
const selectedStatus = ref<StatusFilter>('all');
const sortBy = ref<WorkspaceProjectSort>('latest');
const viewMode = ref<WorkspaceProjectView>('grid');
const currentPage = ref(1);

const pageSize = workspaceProjectsClient.getPageSize();

const projectGroupLabel = computed(() => {
  const projectGroup = projectGroups.find(group => group.tdei_project_group_id === workspace.tdeiProjectGroupId);

  return projectGroup?.name ?? `Project Group ${workspace.tdeiProjectGroupId}`;
});

const sortOptions: SelectOption[] = [
  { label: 'Latest', value: 'latest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'A-Z', value: 'name_asc' },
  { label: 'Z-A', value: 'name_desc' },
];

const viewOptions: Array<{ icon: string; label: string; value: WorkspaceProjectView }> = [
  { icon: 'grid_view', label: 'Grid view', value: 'grid' },
  { icon: 'view_list', label: 'List view', value: 'list' },
];

const statusOptions: SelectOption[] = [
  { label: 'All', value: 'all' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Draft', value: 'draft' },
];

const projects = computed(() => projectsResponse.value.results);
const pagination = computed(() => projectsResponse.value.pagination);

const totalPages = computed(() =>
  Math.max(1, Math.ceil(pagination.value.total / pagination.value.pageSize)),
);

const pageNumbers = computed(() =>
  Array.from({ length: totalPages.value }, (_, index) => index + 1),
);

const paginationSummary = computed(() => {
  if (pagination.value.total === 0 || projects.value.length === 0) {
    return 'Showing 0 entries';
  }

  const start = (pagination.value.page - 1) * pagination.value.pageSize + 1;
  const end = start + projects.value.length - 1;

  return `Showing ${start} to ${end} of ${pagination.value.total} entries`;
});

const liveRegionSummary = computed(() =>
  `${pagination.value.total} projects found. Page ${pagination.value.page} of ${totalPages.value}.`,
);

let searchDebounce: ReturnType<typeof setTimeout> | undefined;

function buildProjectsQuery(client: typeof workspaceProjectsClient): WorkspaceProjectsQuery {
  return {
    status: selectedStatus.value === 'all'
      ? undefined
      : selectedStatus.value === 'in_progress'
        ? 'open'
        : selectedStatus.value,
    textSearch: searchQuery.value.trim() || undefined,
    page: currentPage.value,
    pageSize,
    ...client.getSortQuery(sortBy.value),
  };
}

async function loadProjects() {
  await projectsLoading.cancelable(workspaceProjectsClient, async (client) => {
    projectsResponse.value = await client.getWorkspaceProjects(
      workspace.id,
      buildProjectsQuery(client),
    );
  });
}

async function refreshProjects(resetPage: boolean = false) {
  if (resetPage && currentPage.value !== 1) {
    currentPage.value = 1;
    return;
  }

  await loadProjects();
}

await loadProjects();

watch([selectedStatus, sortBy], () => {
  void refreshProjects(true);
});

watch(searchQuery, () => {
  if (searchDebounce) {
    clearTimeout(searchDebounce);
  }

  searchDebounce = setTimeout(() => {
    void refreshProjects(true);
  }, 250);
});

watch(currentPage, () => {
  void loadProjects();
});

function goToPage(pageNumber: number) {
  if (pageNumber < 1 || pageNumber > totalPages.value) {
    return;
  }

  currentPage.value = pageNumber;
}

function resetFilters() {
  searchQuery.value = '';
  selectedStatus.value = 'all';
  sortBy.value = 'latest';
}

onBeforeUnmount(() => {
  if (searchDebounce) {
    clearTimeout(searchDebounce);
  }
});
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.workspace-projects-page {
  padding-top: 1.75rem;
  padding-bottom: 2.5rem;
}

.workspace-projects-header {
  margin-bottom: 1.75rem;
}

.workspace-projects-title {
  margin-bottom: 0.35rem;
}

.workspace-projects-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  margin-bottom: 2rem;
}

.workspace-projects-filters {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-width: 0;
}

.workspace-projects-search {
  position: relative;
  width: min(100%, 18.25rem);
  flex-shrink: 0;
}

.workspace-projects-search-input {
  min-height: 2.5rem;
  padding-right: 2.8rem;
  border-color: $gray-300;
  border-radius: 0.35rem;
}

.workspace-projects-search-icon {
  position: absolute;
  top: 50%;
  right: 0.8rem;
  transform: translateY(-50%);
  color: $secondary;
  pointer-events: none;
}

.workspace-projects-filter-group {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.workspace-projects-filter-group .tdei-select {
  width: 12.5rem;
}

.workspace-projects-page :deep(.tdei-select-toggle),
.workspace-projects-page :deep(.tdei-select-menu) {
  border-radius: 0.35rem;
}

.workspace-projects-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.workspace-projects-view-toggle {
  display: inline-flex;
  align-items: center;
  background-color: #fff;
  border: 1px solid $gray-300;
  border-radius: 0.35rem;
  overflow: hidden;
}

.workspace-projects-view-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.4rem;
  color: $secondary;
  background-color: #fff;
  border: 0;
}

.workspace-projects-view-button-active {
  background-color: $gray-200;
}

.workspace-projects-toolbar-divider {
  width: 1px;
  height: 2.6rem;
  background-color: $gray-300;
}

.workspace-projects-create-button {
  min-height: 2.5rem;
  padding-inline: 1.35rem;
  border-radius: 0.35rem;
}

.workspace-projects-results,
.workspace-projects-list {
  display: grid;
  gap: 1rem;
}

.workspace-projects-list {
  gap: 0;
  border-top: 1px solid rgba($text-navy, 0.08);
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.workspace-projects-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.6rem 1.2rem;
}

.workspace-projects-empty-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 0;
}

.workspace-projects-empty-title {
  margin: 0;
  color: $secondary;
}

.workspace-projects-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid $gray-300;
}

.workspace-projects-footer-copy {
  margin: 0;
  font-size: 1rem;
}

.workspace-projects-pagination {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
}

.workspace-projects-pagination-arrow,
.workspace-projects-pagination-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  color: $text-navy;
  background: transparent;
  border: 0;
  border-radius: $border-radius;
}

.workspace-projects-pagination-number-active {
  color: #fff;
  background-color: $primary;
}

.workspace-projects-pagination-arrow:disabled {
  opacity: 0.45;
}

@include media-breakpoint-down(xl) {
  .workspace-projects-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@include media-breakpoint-down(lg) {
  .workspace-projects-toolbar,
  .workspace-projects-filters {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace-projects-search,
  .workspace-projects-filter-group .tdei-select {
    width: 100%;
  }

  .workspace-projects-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@include media-breakpoint-down(md) {
  .workspace-projects-filter-group,
  .workspace-projects-toolbar-actions,
  .workspace-projects-footer {
    flex-wrap: wrap;
  }
}

@include media-breakpoint-down(sm) {
  .workspace-projects-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-projects-empty-state,
  .workspace-projects-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
