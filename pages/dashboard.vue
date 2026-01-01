<template>
  <app-page class="dashboard-page">
    <div class="d-flex">
        <h2 class="visually-hidden">My Workspaces</h2>

        <label for="ws_project_group_picker">Project Group</label>
        <project-group-picker v-model="currentProjectGroup" id="ws_project_group_picker" />

        <nuxt-link class="btn btn-primary flex-shrink-0" to="/workspace/create">
          <app-icon variant="add" size="24" />
          New<span class="d-none d-sm-inline"> Workspace</span>
        </nuxt-link>
    </div>

    <div v-if="!currentWorkspaces" class="alert alert-info mt-4">
      <app-icon variant="info" />
      No workspaces exist in the selected project group.
    </div>
    <div v-else class="row mt-4 position-relative">
      <div class="col-md mb-3">
        <div class="list-group">
          <dashboard-workspace-item
            v-for="w in currentWorkspaces"
            :key="w.id"
            :workspace="w"
            :selected="w.id === currentWorkspace?.id"
            @click="selectWorkspace(w)"
          />
        </div>
      </div><!-- .col-md -->

      <div class="col-md workspace-details-col">
        <div
          v-if="currentWorkspace"
          class="card"
        >
          <nav class="card-header">
            <dashboard-toolbar :workspace="currentWorkspace" />
          </nav>

          <dashboard-map :workspace="currentWorkspace" @center-loaded="onCenterLoaded" />
          <dashboard-details-table
            :workspace="currentWorkspace"
            :my-tdei-roles="currentWorkspaceTdeiRoles"
          />
        </div><!-- .card -->
      </div><!-- .col-md -->
    </div><!-- .row -->
  </app-page>
</template>

<script setup lang="ts">
import { tdeiUserClient, workspacesClient } from '~/services/index';
import { compareWorkspaceCreatedAtDesc } from '~/services/workspaces';

const STORAGE_KEY_PROJECT_GROUP = 'tdei-selected-project-group';
const STORAGE_KEY_WORKSPACE = 'tdei-selected-workspace';

function getLastProjectGroupId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PROJECT_GROUP);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { id: string; name: string };
    return stored.id ?? null;
  } catch {
    return null;
  }
}
function getLastWorkspaceId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(STORAGE_KEY_WORKSPACE);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
function setLastWorkspaceId(id: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY_WORKSPACE, String(id));
  } catch { /* silently fail */ }
}

const route = useRoute();

const [workspaces, { items: myProjectGroups }] = await Promise.all([
  workspacesClient.getMyWorkspaces().then(ws => ws.sort(compareWorkspaceCreatedAtDesc)),
  tdeiUserClient.getMyProjectGroups(1, '', 10000),
]);
const rolesByProjectGroup = new Map(myProjectGroups.map(pg => [pg.tdei_project_group_id, pg.roles]));
const workspacesByProjectGroup = Map.groupBy(workspaces, w => w.tdeiProjectGroupId);

const currentProjectGroup = ref(getLastProjectGroupId());
const currentWorkspace = ref<Workspace>();
const currentWorkspaces = computed(() =>
  currentProjectGroup.value
    ? workspacesByProjectGroup.get(currentProjectGroup.value)
    : undefined,
);
const currentWorkspaceTdeiRoles = computed(() =>
  currentWorkspace.value
    ? rolesByProjectGroup.get(currentWorkspace.value.tdeiProjectGroupId) ?? []
    : [],
);

for (const w of workspaces) {
  if (w.tdeiMetadata?.length > 0) {
    w.tdeiMetadata = JSON.parse(w.tdeiMetadata);
  }
}

onMounted(() => {
  watch(currentWorkspace, (val) => { if (val?.id) setLastWorkspaceId(val.id) });
  watch(currentWorkspaces, onCurrentWorkspacesChange);

  autoSelectPreferredView();
  onCurrentWorkspacesChange(currentWorkspaces.value);
});

function autoSelectPreferredView() {
  if (route.query.workspace) {
    const workspaceId = Number(route.query.workspace);
    const workspace = workspaces.find(w => w.id === workspaceId);

    if (workspace) {
      selectWorkspace(workspace);
      currentProjectGroup.value = workspace.tdeiProjectGroupId;
      return;
    }
  }

  const lastWorkspaceId = getLastWorkspaceId();
  if (lastWorkspaceId) {
    const workspace = workspaces.find(w => w.id === lastWorkspaceId);

    if (workspace) {
      selectWorkspace(workspace);
      currentProjectGroup.value = workspace.tdeiProjectGroupId;
      return;
    }
  }

  // currentProjectGroup is already initialized from sessionStorage synchronously
}

async function onCurrentWorkspacesChange(val) {
  if (val?.length > 0) {
    if (val[0].tdeiProjectGroupId !== currentWorkspace.value?.tdeiProjectGroupId) {
      await selectWorkspace(val[0]);
    }
  }
  else {
    currentWorkspace.value = undefined;
  }
}

function onCenterLoaded(center) {
  currentWorkspace.value!.center = center;
}

async function selectWorkspace(workspace) {
  currentWorkspace.value = workspace;
}
</script>

<style lang="scss">
@import "assets/scss/theme.scss";

.dashboard-page {
  label[for=ws_project_group_picker] {
    flex-shrink: 0;
    align-self: center;
    font-size: $h5-font-size;
    margin-right: 1rem;

    @include media-breakpoint-down(md) {
      & {
        display: none;
      }
    }
  }

  .project-group-picker {
    width: 100%;
    border-color: $border-color;
    margin-right: 1rem;

    @include media-breakpoint-up(md) {
      width: auto;
      min-width: 300px;
      border-color: transparent;
      border-left-color: $border-color;
      margin-right: auto;

      &:hover {
        border-color: $border-color;
      }
    }
  }

  .workspace-details-col {
    position: sticky;
    top: 1rem;
    margin-bottom: auto;
  }
}
</style>
