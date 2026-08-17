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
            <h2 id="dashboard-workspace-title">
              <span class="dashboard-workspace-title-text">{{ currentWorkspace.title }}</span>
              <dashboard-workspace-import-status-badge
                v-if="currentWorkspace.importStatus
                  && currentWorkspace.importStatus !== 'empty'"
                :status="currentWorkspace.importStatus"
                :interactive="currentWorkspace.importStatus === 'failed'"
                @click="showJobFailure(currentWorkspace.id)"
              />
            </h2>
            <div class="dashboard-workspace-heading-meta">
              <span class="dashboard-workspace-badge">{{ workspaceTypeLabel }}</span>
              <span class="dashboard-workspace-badge">{{ workspaceRoleLabel }}</span>
              <span class="dashboard-workspace-updated">
                <img
                  :src="timelineIcon"
                  alt=""
                >
                Updated {{ workspaceUpdatedTime }}
              </span>
            </div>
          </div>

          <dashboard-toolbar
            :workspace="currentWorkspace"
            :refreshing="refreshingWorkspaces"
            @refresh="refreshWorkspaces"
          />
        </header>

        <div class="dashboard-details-content">
          <div class="dashboard-map-frame">
            <dashboard-map
              :workspace="currentWorkspace"
              @center-loaded="onCenterLoaded"
            />
          </div>

          <dashboard-workspace-information
            :workspace="currentWorkspace"
            :my-tdei-roles="currentWorkspaceTdeiRoles"
          />
        </div>
      </section>

      <section
        v-else
        class="dashboard-workspace-details dashboard-workspace-unavailable"
        aria-live="polite"
      >
        <app-icon
          variant="hourglass_empty"
          size="30"
          no-margin
        />
        <h2>No workspace available to open</h2>
        <p>
          Workspaces still being imported cannot be opened. Use Refresh to check their latest status.
        </p>
        <button
          class="btn btn-outline-secondary"
          type="button"
          :disabled="refreshingWorkspaces"
          @click="refreshWorkspaces"
        >
          <app-icon
            variant="refresh"
            size="20"
            no-margin
          />
          Refresh
        </button>
      </section>
    </section>

    <dashboard-workspace-job-failure-dialog ref="jobFailureDialog" />
  </app-page>
</template>

<script setup lang="ts">
import timelineIcon from '~/assets/img/timeline.svg';
import { tdeiUserClient, workspacesClient } from '~/services/index';
import { compareWorkspaceCreatedAtDesc } from '~/services/workspaces';
import { formatElapsed } from '~/util/time';
import { ROLE_LABELS } from '~/util/roles';
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

import type { Workspace, WorkspaceCenter } from '~/types/workspaces';

type JobFailureDialog = {
  show: (workspaceId: number) => Promise<void>;
};

const STORAGE_KEY_PROJECT_GROUP = 'tdei-selected-project-group';
const STORAGE_KEY_WORKSPACE = 'tdei-selected-workspace';
const route = useRoute();

const [initialWorkspaces, { items: myProjectGroups }] = await Promise.all([
  workspacesClient.getMyWorkspaces().then(items => items.sort(compareWorkspaceCreatedAtDesc)),
  tdeiUserClient.getMyProjectGroups(1, '', 10000)
]);
const workspaces = ref<Workspace[]>(initialWorkspaces);

const rolesByProjectGroup = new Map(
  myProjectGroups.map(projectGroup => [projectGroup.tdei_project_group_id, projectGroup.roles])
);
const workspacesByProjectGroup = computed(() =>
  Map.groupBy(workspaces.value, workspace => workspace.tdeiProjectGroupId)
);

const currentProjectGroup = ref<string | null>(getLastProjectGroupId());
const currentWorkspace = ref<Workspace>();
const workspaceSearch = ref('');
const refreshingWorkspaces = ref(false);
const jobFailureDialog = useTemplateRef<JobFailureDialog>('jobFailureDialog');

const currentWorkspaces = computed<Workspace[]>(() =>
  currentProjectGroup.value
    ? workspacesByProjectGroup.value.get(currentProjectGroup.value) ?? []
    : []
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
    : []
);
const workspaceListSummary = computed(() =>
  `${workspaceListItems.value.length} of ${currentWorkspaces.value.length} workspaces shown.`
);
const workspaceTypeLabel = computed(() => currentWorkspace.value?.type.toUpperCase() ?? '');
const workspaceRoleLabel = computed(() => {
  const role = currentWorkspace.value?.role;
  return role ? ROLE_LABELS[role] : 'Member';
});
const workspaceUpdatedTime = computed(() =>
  currentWorkspace.value
    ? formatElapsed(currentWorkspace.value.updatedAt ?? currentWorkspace.value.createdAt)
    : ''
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

function syncSelectedWorkspace(availableWorkspaces: Workspace[]): void {
  if (availableWorkspaces.length === 0) {
    currentWorkspace.value = undefined;
    return;
  }

  const selectedWorkspace = availableWorkspaces.find(
    workspace => workspace.id === currentWorkspace.value?.id
  );

  selectWorkspace(selectedWorkspace ?? availableWorkspaces[0]!);
}

function autoSelectPreferredWorkspace(): void {
  const routeWorkspaceId = Number(route.query.workspace);
  const preferredWorkspaceId = Number.isFinite(routeWorkspaceId) && routeWorkspaceId > 0
    ? routeWorkspaceId
    : getLastWorkspaceId();

  if (!preferredWorkspaceId) {
    return;
  }

  const workspace = workspaces.value.find(item => item.id === preferredWorkspaceId);
  if (workspace) {
    currentProjectGroup.value = workspace.tdeiProjectGroupId;
    selectWorkspace(workspace);
  }
}

function selectWorkspace(workspace: Workspace): void {
  currentWorkspace.value = workspace;
}

function showJobFailure(workspaceId: number): void {
  void jobFailureDialog.value?.show(workspaceId);
}

async function refreshWorkspaces(): Promise<void> {
  if (refreshingWorkspaces.value) {
    return;
  }

  refreshingWorkspaces.value = true;

  try {
    const refreshedWorkspaces = await workspacesClient.getMyWorkspaces();
    const existingWorkspaces = new Map(
      workspaces.value.map(workspace => [workspace.id, workspace])
    );

    workspaces.value = refreshedWorkspaces
      .map((workspace) => {
        const existingWorkspace = existingWorkspaces.get(workspace.id);
        return existingWorkspace?.center
          ? { ...workspace, center: existingWorkspace.center }
          : workspace;
      })
      .sort(compareWorkspaceCreatedAtDesc);
  }
  catch (error: unknown) {
    toast.error(error instanceof Error ? error.message : 'Failed to refresh workspaces.');
  }
  finally {
    refreshingWorkspaces.value = false;
  }
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
$dashboard-topbar-spacing: 1.25rem;
$dashboard-control-height: 2.5rem;
$dashboard-shell-height: calc(100vh - #{$navbar-height} - 8.5rem);
$dashboard-sidebar-width: minmax(18rem, 29%);
$dashboard-shell-radius: 0.75rem;
$dashboard-panel-padding: 1rem;
$dashboard-panel-gap: 1rem;
$dashboard-details-padding: 0.85rem;
$dashboard-details-max-width: 81.25rem;
$dashboard-header-height: 6rem;
$dashboard-header-radius: 0.8125rem;
$dashboard-header-padding: 1.2rem 1.6rem;
$dashboard-heading-gap: 0.65rem;
$dashboard-list-title-size: 1rem;
$dashboard-details-title-size: 1.2rem;
$dashboard-copy-size: 0.8rem;
$dashboard-badge-padding: 0.16rem 0.45rem;
$dashboard-map-radius: 0.65rem;
$dashboard-details-gap: 0.65rem;
$dashboard-empty-max-width: 34rem;
$dashboard-create-button-width: 13.875rem;
$dashboard-create-button-height: 3rem;
$dashboard-create-button-radius: 0.375rem;

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
  box-shadow: $control-shadow;
  white-space: nowrap;
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
  font-size: $dashboard-list-title-size;
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
  font-family: var(--primary-font-family);
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
  color: $text-secondary;
  font-family: var(--primary-font-family);
  font-size: $dashboard-list-title-size;
  font-weight: $font-weight-bold;
  line-height: 1.5;
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

.dashboard-workspace-unavailable {
  min-height: 20rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.75rem;
  padding: 2rem;
  color: $text-secondary;
  text-align: center;
}

.dashboard-workspace-unavailable h2,
.dashboard-workspace-unavailable p {
  margin: 0;
}

.dashboard-workspace-header {
  min-height: $dashboard-header-height;
  flex: 0 0 auto;
  padding: $dashboard-header-padding;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $dashboard-panel-gap;
  background: $purple-background-subtle;
  border-bottom: $border-width solid $border-color;
  border-radius: 0 $dashboard-header-radius 0 0;
}

.dashboard-workspace-heading {
  min-width: 0;
  display: grid;
  gap: $dashboard-heading-gap;
}

.dashboard-workspace-heading h2 {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  margin: 0;
  color: $text-navy;
  font-family: var(--primary-font-family);
  font-size: $dashboard-details-title-size;
  font-weight: $font-weight-bold;
  line-height: 1.25;
  white-space: nowrap;
}

.dashboard-workspace-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-workspace-heading-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.55rem;
  color: $text-secondary;
  font-size: $dashboard-copy-size;
}

.dashboard-workspace-badge {
  padding: $dashboard-badge-padding;
  line-height: 1;
  background: $surface-badge-muted;
  border: $border-width solid $border-badge-muted;
  border-radius: $border-radius;
}

.dashboard-workspace-updated {
  padding-left: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-left: $border-width solid rgba($text-secondary, 0.25);
}

.dashboard-workspace-updated img {
  width: 1rem;
  height: 1rem;
}

.dashboard-details-content {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-width: $dashboard-details-max-width;
  padding: $dashboard-details-padding;
  display: grid;
  grid-template-rows: minmax(10rem, 1fr) auto;
  gap: $dashboard-details-gap;
}

.dashboard-map-frame {
  min-height: 0;
  overflow: hidden;
  border: $border-width solid $border-color;
  border-radius: $dashboard-map-radius;
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

  .dashboard-workspace-header {
    min-height: 0;
  }
}

@include media-breakpoint-down(sm) {
  .dashboard-page {
    padding-right: 0.75rem;
    padding-left: 0.75rem;
  }

  .dashboard-create-button {
    justify-content: center;
  }

  .dashboard-workspace-header {
    padding: $dashboard-panel-padding;
    border-radius: 0;
  }

  .dashboard-workspace-title-text {
    white-space: normal;
  }

}
</style>
