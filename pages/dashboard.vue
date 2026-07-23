<template>
  <app-page
    fluid
    class="dashboard-page"
  >
    <h1 class="visually-hidden">Dashboard</h1>

    <header class="dashboard-topbar">
      <div class="dashboard-project-group-control">
        <label for="ws_project_group_picker">Project Group</label>
        <project-group-picker
          id="ws_project_group_picker"
          v-model="currentProjectGroup"
          :options="myProjectGroups"
          remember-selection
        />
      </div>

      <nuxt-link
        class="btn btn-primary dashboard-create-button"
        to="/workspace/create"
      >
        <app-icon
          variant="add"
          size="22"
          no-margin
        />
        Create Workspace
      </nuxt-link>
    </header>

    <section
      v-if="currentWorkspaces.length === 0"
      class="dashboard-empty-state"
      aria-live="polite"
    >
      <span
        class="dashboard-empty-icon"
        aria-hidden="true"
      >
        <app-icon
          variant="workspaces"
          size="30"
          no-margin
        />
      </span>
      <h2>No workspaces yet</h2>
      <p>No workspaces exist in the selected project group.</p>
      <nuxt-link
        class="btn btn-primary"
        to="/workspace/create"
      >
        Create Workspace
      </nuxt-link>
    </section>

    <section
      v-else
      class="dashboard-shell"
    >
      <aside
        class="dashboard-workspace-panel"
        aria-labelledby="workspace-list-title"
      >
        <div class="dashboard-workspace-panel-header">
          <h2 id="workspace-list-title">Workspaces</h2>

          <div class="dashboard-workspace-search">
            <label
              class="visually-hidden"
              for="dashboard-workspace-search"
            >
              Search workspaces
            </label>
            <input
              id="dashboard-workspace-search"
              v-model.trim="workspaceSearch"
              class="form-control"
              type="search"
              placeholder="Search Workspaces"
            >
            <app-icon
              variant="search"
              size="22"
              no-margin
            />
          </div>
        </div>

        <p
          class="visually-hidden"
          aria-live="polite"
        >
          {{ workspaceListSummary }}
        </p>

        <div
          v-if="workspaceListItems.length > 0"
          class="dashboard-workspace-list"
        >
          <dashboard-workspace-item
            v-for="workspace in workspaceListItems"
            :key="workspace.id"
            :workspace="workspace"
            :selected="workspace.id === currentWorkspace?.id"
            @click="selectWorkspace(workspace)"
          />
        </div>

        <div
          v-else
          class="dashboard-search-empty"
          aria-live="polite"
        >
          <p>No workspaces match “{{ workspaceSearch }}”.</p>
          <button
            class="btn btn-link"
            type="button"
            @click="workspaceSearch = ''"
          >
            Clear search
          </button>
        </div>
      </aside>

      <section
        v-if="currentWorkspace"
        class="dashboard-workspace-details"
        aria-labelledby="dashboard-workspace-title"
      >
        <header class="dashboard-workspace-header">
          <div class="dashboard-workspace-heading">
            <h2 id="dashboard-workspace-title">{{ currentWorkspace.title }}</h2>
            <div class="dashboard-workspace-heading-meta">
              <span class="dashboard-workspace-badge">{{ workspaceTypeLabel }}</span>
              <span class="dashboard-workspace-badge">{{ workspaceRoleLabel }}</span>
              <span class="dashboard-workspace-created">
                <app-icon
                  variant="schedule"
                  size="18"
                  no-margin
                />
                Created {{ workspaceCreatedTime }}
              </span>
            </div>
          </div>

          <dashboard-toolbar :workspace="currentWorkspace" />
        </header>

        <div class="dashboard-details-content">
          <div class="dashboard-map-frame">
            <dashboard-map
              :workspace="currentWorkspace"
              @center-loaded="onCenterLoaded"
            />
          </div>

          <section
            class="dashboard-summary-grid"
            aria-label="Workspace totals"
          >
            <article class="dashboard-summary-card">
              <div>
                <h3>Total Projects</h3>
                <strong aria-live="polite">{{ projectCountLabel }}</strong>
              </div>
              <span
                class="dashboard-summary-icon dashboard-summary-icon-projects"
                aria-hidden="true"
              >
                <img
                  :src="projectsIcon"
                  alt=""
                >
              </span>
            </article>

            <article class="dashboard-summary-card">
              <div>
                <h3>Total Members</h3>
                <strong aria-live="polite">{{ memberCountLabel }}</strong>
              </div>
              <span
                class="dashboard-summary-icon dashboard-summary-icon-members"
                aria-hidden="true"
              >
                <img
                  :src="membersIcon"
                  alt=""
                >
              </span>
            </article>
          </section>

          <dashboard-workspace-information
            :workspace="currentWorkspace"
            :my-tdei-roles="currentWorkspaceTdeiRoles"
          />
        </div>
      </section>
    </section>
  </app-page>
</template>

<script setup lang="ts">
import membersIcon from '~/assets/img/members.svg';
import projectsIcon from '~/assets/img/projects.svg';
import { tdeiUserClient, workspacesClient } from '~/services/index';
import { compareWorkspaceCreatedAtDesc } from '~/services/workspaces';
import { formatElapsed } from '~/util/time';
import { ROLE_LABELS } from '~/util/roles';

import type { Workspace, WorkspaceCenter } from '~/types/workspaces';

const STORAGE_KEY_PROJECT_GROUP = 'tdei-selected-project-group';
const STORAGE_KEY_WORKSPACE = 'tdei-selected-workspace';
const route = useRoute();

const [workspaces, { items: myProjectGroups }] = await Promise.all([
  workspacesClient.getMyWorkspaces().then(items => items.sort(compareWorkspaceCreatedAtDesc)),
  tdeiUserClient.getMyProjectGroups(1, '', 10000),
]);

const rolesByProjectGroup = new Map(
  myProjectGroups.map(projectGroup => [projectGroup.tdei_project_group_id, projectGroup.roles]),
);
const workspacesByProjectGroup = Map.groupBy(
  workspaces,
  workspace => workspace.tdeiProjectGroupId,
);

const currentProjectGroup = ref<string | null>(getLastProjectGroupId());
const currentWorkspace = ref<Workspace>();
const workspaceSearch = ref('');

const currentWorkspaces = computed<Workspace[]>(() =>
  currentProjectGroup.value
    ? workspacesByProjectGroup.get(currentProjectGroup.value) ?? []
    : [],
);
const workspaceListItems = computed<Workspace[]>(() => {
  const normalizedSearch = workspaceSearch.value.toLocaleLowerCase();

  return currentWorkspaces.value
    .filter(workspace => workspace.title.toLocaleLowerCase().includes(normalizedSearch))
    .sort((firstWorkspace, secondWorkspace) => {
      const selectedWorkspaceId = currentWorkspace.value?.id;
      return Number(secondWorkspace.id === selectedWorkspaceId)
        - Number(firstWorkspace.id === selectedWorkspaceId);
    });
});
const currentWorkspaceTdeiRoles = computed<string[]>(() =>
  currentWorkspace.value
    ? rolesByProjectGroup.get(currentWorkspace.value.tdeiProjectGroupId) ?? []
    : [],
);
const workspaceListSummary = computed(() =>
  `${workspaceListItems.value.length} of ${currentWorkspaces.value.length} workspaces shown.`,
);
const workspaceTypeLabel = computed(() => currentWorkspace.value?.type.toUpperCase() ?? '');
const workspaceRoleLabel = computed(() => {
  const role = currentWorkspace.value?.role;
  return role ? ROLE_LABELS[role] : 'Member';
});
const workspaceCreatedTime = computed(() =>
  currentWorkspace.value ? formatElapsed(currentWorkspace.value.createdAt) : '',
);
const projectCountLabel = computed(() =>
  formatSummaryCount(currentWorkspace.value?.projectCount),
);
const memberCountLabel = computed(() =>
  formatSummaryCount(currentWorkspace.value?.memberCount),
);

watch(currentWorkspace, (workspace) => {
  if (workspace) {
    setLastWorkspaceId(workspace.id);
  }
});

watch(currentWorkspaces, (nextWorkspaces) => {
  workspaceSearch.value = '';
  syncSelectedWorkspace(nextWorkspaces);
});

onMounted(() => {
  autoSelectPreferredWorkspace();
  syncSelectedWorkspace(currentWorkspaces.value);
});

function formatSummaryCount(count?: number | null): string {
  return count == null ? '—' : count.toLocaleString();
}

function syncSelectedWorkspace(availableWorkspaces: Workspace[]): void {
  if (availableWorkspaces.length === 0) {
    currentWorkspace.value = undefined;
    return;
  }

  const selectionStillAvailable = availableWorkspaces.some(
    workspace => workspace.id === currentWorkspace.value?.id,
  );

  if (!selectionStillAvailable) {
    selectWorkspace(availableWorkspaces[0]!);
  }
}

function autoSelectPreferredWorkspace(): void {
  const routeWorkspaceId = Number(route.query.workspace);
  const preferredWorkspaceId = Number.isFinite(routeWorkspaceId) && routeWorkspaceId > 0
    ? routeWorkspaceId
    : getLastWorkspaceId();

  if (!preferredWorkspaceId) {
    return;
  }

  const workspace = workspaces.find(item => item.id === preferredWorkspaceId);
  if (workspace) {
    currentProjectGroup.value = workspace.tdeiProjectGroupId;
    selectWorkspace(workspace);
  }
}

function selectWorkspace(workspace: Workspace): void {
  currentWorkspace.value = workspace;
}

function onCenterLoaded(center: WorkspaceCenter): void {
  if (currentWorkspace.value) {
    currentWorkspace.value.center = center;
  }
}

function getLastProjectGroupId(): string | null {
  if (import.meta.server) {
    return null;
  }

  try {
    const rawSelection = sessionStorage.getItem(STORAGE_KEY_PROJECT_GROUP);
    if (!rawSelection) {
      return null;
    }

    const storedSelection = JSON.parse(rawSelection) as { id?: unknown };
    return typeof storedSelection.id === 'string' ? storedSelection.id : null;
  }
  catch {
    return null;
  }
}

function getLastWorkspaceId(): number | null {
  if (import.meta.server) {
    return null;
  }

  try {
    const storedWorkspaceId = Number(sessionStorage.getItem(STORAGE_KEY_WORKSPACE));
    return Number.isFinite(storedWorkspaceId) && storedWorkspaceId > 0
      ? storedWorkspaceId
      : null;
  }
  catch {
    return null;
  }
}

function setLastWorkspaceId(workspaceId: number): void {
  if (import.meta.server) {
    return;
  }

  try {
    sessionStorage.setItem(STORAGE_KEY_WORKSPACE, String(workspaceId));
  }
  catch {
    // Browsers can disable storage. Selection persistence is optional.
  }
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

$dashboard-page-inline-padding: 2rem;
$dashboard-topbar-gap: 1.5rem;
$dashboard-topbar-spacing: 1.5rem;
$dashboard-control-height: 2.8rem;
$dashboard-shell-height: calc(100vh - #{$navbar-height} - 8.5rem);
$dashboard-sidebar-width: minmax(18rem, 29%);
$dashboard-shell-radius: 0.75rem;
$dashboard-panel-padding: 1.2rem;
$dashboard-panel-gap: 1rem;
$dashboard-details-padding: 0.85rem;
$dashboard-details-max-width: 81.25rem;
$dashboard-header-padding: 0.75rem 1rem;
$dashboard-heading-gap: 0.25rem;
$dashboard-title-size: 1.15rem;
$dashboard-copy-size: 0.9rem;
$dashboard-badge-padding: 0.2rem 0.55rem;
$dashboard-map-radius: 0.65rem;
$dashboard-summary-gap: 0.65rem;
$dashboard-summary-padding: 0.55rem 0.85rem;
$dashboard-summary-radius: 0.65rem;
$dashboard-summary-icon-size: 2.2rem;
$dashboard-summary-value-size: 1.35rem;
$dashboard-empty-max-width: 34rem;
$dashboard-create-button-width: 13.875rem;
$dashboard-create-button-height: 3rem;
$dashboard-create-button-radius: 0.375rem;
$dashboard-create-button-shadow: 0 0.0625rem 0.375rem rgba($black, 0.05);
$dashboard-badge-background: #0015800a;
$dashboard-badge-border: #0011661a;

.dashboard-page {
  padding-right: $dashboard-page-inline-padding;
  padding-left: $dashboard-page-inline-padding;
}

.dashboard-topbar {
  margin-bottom: $dashboard-topbar-spacing;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $dashboard-topbar-gap;
}

.dashboard-project-group-control {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: $spacer;
}

.dashboard-project-group-control > label {
  margin: 0;
  flex-shrink: 0;
  color: $text-navy;
  font-weight: $font-weight-semibold;
}

.dashboard-project-group-control :deep(.project-group-picker) {
  width: min(24rem, 55vw);
}

.dashboard-project-group-control :deep(.form-select),
.dashboard-create-button {
  min-height: $dashboard-control-height;
}

.dashboard-create-button {
  width: $dashboard-create-button-width;
  height: $dashboard-create-button-height;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  flex-shrink: 0;
  background: $primary;
  border: $border-width solid $primary;
  border-radius: $dashboard-create-button-radius;
  box-shadow: $dashboard-create-button-shadow;
}

.dashboard-empty-state {
  max-width: $dashboard-empty-max-width;
  margin: 8vh auto 0;
  padding: 2.5rem;
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  color: $secondary;
  text-align: center;
  background: $white;
  border: $border-width solid $border-color;
  border-radius: $dashboard-shell-radius;
}

.dashboard-empty-icon {
  width: 3.5rem;
  height: 3.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: $primary;
  background: rgba($primary, 0.08);
  border-radius: 50%;
}

.dashboard-empty-state h2,
.dashboard-empty-state p {
  margin: 0;
}

.dashboard-empty-state h2 {
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: $dashboard-title-size;
}

.dashboard-shell {
  height: $dashboard-shell-height;
  min-height: 0;
  display: grid;
  grid-template-columns: $dashboard-sidebar-width minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden;
  background: $white;
  border: $border-width solid $border-color;
  border-radius: $dashboard-shell-radius;
}

.dashboard-workspace-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: $border-width solid $border-color;
}

.dashboard-workspace-panel-header {
  flex: 0 0 auto;
  padding: $dashboard-panel-padding;
  display: grid;
  gap: $dashboard-panel-gap;
}

.dashboard-workspace-panel-header h2 {
  margin: 0;
  color: $secondary;
  font-family: var(--secondary-font-family);
  font-size: $dashboard-title-size;
  font-weight: $font-weight-semibold;
}

.dashboard-workspace-search {
  position: relative;
}

.dashboard-workspace-search .form-control {
  min-height: $dashboard-control-height;
  padding-right: 2.8rem;
  font-size: $dashboard-copy-size;
}

.dashboard-workspace-search > :deep(.material-icons) {
  position: absolute;
  top: 50%;
  right: $spacer;
  color: $secondary;
  transform: translateY(-50%);
}

.dashboard-workspace-list {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 $dashboard-panel-padding $dashboard-panel-padding;
  display: grid;
  align-content: start;
  gap: $dashboard-panel-gap;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba($secondary, 0.3) transparent;
}

.dashboard-search-empty {
  padding: 2rem $dashboard-panel-padding;
  color: $secondary;
  text-align: center;
}

.dashboard-search-empty p {
  margin: 0;
}

.dashboard-workspace-details {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.dashboard-workspace-header {
  flex: 0 0 auto;
  padding: $dashboard-header-padding;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $dashboard-panel-gap;
  background: $purple-background-subtle;
  border-bottom: $border-width solid $border-color;
}

.dashboard-workspace-heading {
  min-width: 0;
  display: grid;
  gap: $dashboard-heading-gap;
}

.dashboard-workspace-heading h2 {
  margin: 0;
  overflow: hidden;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: $dashboard-title-size;
  font-weight: $font-weight-semibold;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-workspace-heading-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.55rem;
  color: $secondary;
  font-size: $dashboard-copy-size;
}

.dashboard-workspace-badge {
  padding: $dashboard-badge-padding;
  line-height: 1;
  background: $dashboard-badge-background;
  border: $border-width solid $dashboard-badge-border;
  border-radius: $border-radius;
}

.dashboard-workspace-created {
  padding-left: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-left: $border-width solid rgba($secondary, 0.25);
}

.dashboard-details-content {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-width: $dashboard-details-max-width;
  padding: $dashboard-details-padding;
  display: grid;
  grid-template-rows: minmax(10rem, 1fr) auto auto;
  gap: $dashboard-summary-gap;
}

.dashboard-map-frame {
  min-height: 0;
  overflow: hidden;
  border: $border-width solid $border-color;
  border-radius: $dashboard-map-radius;
}

.dashboard-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $dashboard-summary-gap;
}

.dashboard-summary-card {
  padding: $dashboard-summary-padding;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacer;
  border: $border-width solid $border-color;
  border-radius: $dashboard-summary-radius;
}

.dashboard-summary-card h3 {
  margin: 0 0 0.15rem;
  color: $secondary;
  font-size: $dashboard-copy-size;
  font-weight: $font-weight-normal;
}

.dashboard-summary-card strong {
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: $dashboard-summary-value-size;
  font-weight: $font-weight-semibold;
}

.dashboard-summary-icon {
  width: $dashboard-summary-icon-size;
  height: $dashboard-summary-icon-size;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 50%;
}

.dashboard-summary-icon img {
  width: 100%;
  height: 100%;
}

@include media-breakpoint-down(lg) {
  .dashboard-page {
    padding-right: $spacer;
    padding-left: $spacer;
  }

  .dashboard-shell {
    grid-template-columns: minmax(16rem, 34%) minmax(0, 1fr);
  }

  .dashboard-workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }
}

@include media-breakpoint-down(md) {
  .dashboard-shell {
    height: auto;
    grid-template-columns: 1fr;
  }

  .dashboard-workspace-panel {
    border-right: 0;
    border-bottom: $border-width solid $border-color;
  }

  .dashboard-workspace-details {
    display: block;
  }

  .dashboard-workspace-list {
    max-height: 24rem;
  }

  .dashboard-details-content {
    height: auto;
    grid-template-rows: auto;
  }
}

@include media-breakpoint-down(sm) {
  .dashboard-page {
    padding-right: 0.75rem;
    padding-left: 0.75rem;
  }

  .dashboard-topbar,
  .dashboard-project-group-control {
    align-items: stretch;
    flex-direction: column;
  }

  .dashboard-project-group-control {
    gap: 0.5rem;
  }

  .dashboard-project-group-control :deep(.project-group-picker),
  .dashboard-create-button {
    width: 100%;
  }

  .dashboard-create-button {
    justify-content: center;
  }

  .dashboard-workspace-header {
    padding: $dashboard-panel-padding;
  }

  .dashboard-workspace-heading h2 {
    white-space: normal;
  }

  .dashboard-summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
