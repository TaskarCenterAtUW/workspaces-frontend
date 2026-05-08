<template>
  <app-page class="dashboard-page">
    <div class="d-flex">
        <h2 class="visually-hidden">My Workspaces</h2>

        <label for="ws_project_group_picker">Project Group</label>
        <project-group-picker v-model="currentProjectGroup" v-model:name="currentProjectGroupName" id="ws_project_group_picker" />

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
        <div class="card" :style="currentWorkspace ? '' : 'visibility: hidden'">
          <nav class="card-header">
            <dashboard-toolbar :workspace="currentWorkspace" />
          </nav>

          <dashboard-map :workspace="currentWorkspace" @center-loaded="onCenterLoaded" />
          <dashboard-details-table :workspace="currentWorkspace" />
        </div><!-- .card -->
      </div><!-- .col-md -->
    </div><!-- .row -->
  </app-page>
</template>

<script lang="ts">
const STORAGE_KEY_PROJECT_GROUP = 'tdei-selected-project-group';
const STORAGE_KEY_PROJECT_GROUP_NAME = 'tdei-selected-project-group-name';
const STORAGE_KEY_WORKSPACE = 'tdei-selected-workspace';

function getLastProjectGroupId(): string | null {
  return sessionStorage.getItem(STORAGE_KEY_PROJECT_GROUP);
}
function setLastProjectGroupId(id: string) {
  sessionStorage.setItem(STORAGE_KEY_PROJECT_GROUP, id);
}
function getLastProjectGroupName(): string | null {
  return sessionStorage.getItem(STORAGE_KEY_PROJECT_GROUP_NAME);
}
function setLastProjectGroupName(name: string) {
  sessionStorage.setItem(STORAGE_KEY_PROJECT_GROUP_NAME, name);
}
function getLastWorkspaceId(): number | null {
  const v = sessionStorage.getItem(STORAGE_KEY_WORKSPACE);
  return v ? Number(v) : null;
}
function setLastWorkspaceId(id: number) {
  sessionStorage.setItem(STORAGE_KEY_WORKSPACE, String(id));
}
</script>

<script setup lang="ts">
import { workspacesClient } from '~/services/index';
import { compareWorkspaceCreatedAtDesc } from '~/services/workspaces';

const route = useRoute();

const workspaces = (await workspacesClient.getMyWorkspaces()).sort(compareWorkspaceCreatedAtDesc);
const workspacesByProjectGroup = Map.groupBy(workspaces, w => w.tdeiProjectGroupId);

const currentProjectGroup = ref(getLastProjectGroupId());
const currentProjectGroupName = ref(getLastProjectGroupName());
const currentWorkspace = ref({});
const currentWorkspaces = computed(() => workspacesByProjectGroup.get(currentProjectGroup.value));

for (const w of workspaces) {
  if (w.tdeiMetadata?.length > 0) {
    w.tdeiMetadata = JSON.parse(w.tdeiMetadata);
  }
}

onMounted(() => {
  watch(currentWorkspace, (val) => { if (val?.id) setLastWorkspaceId(val.id) });
  watch(currentProjectGroup, (val) => { if (val) setLastProjectGroupId(val) });
  watch(currentProjectGroupName, (val) => { if (val) setLastProjectGroupName(val) });
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
    if (val[0].tdeiProjectGroupId !== currentWorkspace.value.tdeiProjectGroupId) {
      await selectWorkspace(val[0]);
    }
  } else {
    currentWorkspace.value = {};
  }
}

function onCenterLoaded(center) {
  currentWorkspace.value.center = center;
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
    width: auto;
    min-width: 300px;
    border-color: transparent;
    border-left-color: $border-color;
    margin-right: auto;

    &:hover {
      border-color: $border-color;
    }

    @include media-breakpoint-down(md) {
      & {
        width: 100%;
        border-color: $border-color;
        margin-right: 1rem;
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
