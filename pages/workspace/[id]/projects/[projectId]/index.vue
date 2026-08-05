<template>
  <app-page
    fluid
    padding="none"
    class="project-detail-page"
  >
    <div class="project-detail-layout">
      <div
        class="project-detail-shell"
        :class="{
          'project-detail-shell-with-footer': showSelectedTaskBar
        }"
      >
        <section class="project-detail-content">
          <p
            v-if="permissionLoadError"
            class="alert alert-warning m-3"
            role="alert"
          >
            Your project permissions could not be loaded. Task and project actions are
            temporarily unavailable. Refresh the page to try again.
          </p>

          <header class="project-detail-hero">
            <nav
              class="project-detail-breadcrumbs"
              aria-label="Breadcrumb"
            >
              <nuxt-link :to="projectsRoute">Workspaces</nuxt-link>
              <span aria-hidden="true">&gt;</span>
              <nuxt-link :to="projectsRoute">{{ workspace.title }}</nuxt-link>
              <span aria-hidden="true">&gt;</span>
              <span>{{ breadcrumbProjectName }}</span>
            </nav>

            <div class="project-detail-title-row">
              <h2 class="project-detail-title">
                {{ project.name }}
              </h2>

              <div class="project-detail-hero-actions">
                <button
                  v-if="showProjectEditButton"
                  class="btn project-detail-edit-button"
                  type="button"
                  aria-label="Edit project"
                  @click="openProjectEditPage"
                >
                  <app-icon
                    variant="edit"
                    size="20"
                    no-margin
                  />
                </button>

                <button
                  v-if="showActivateProjectButton"
                  class="btn project-detail-activate-button"
                  type="button"
                  :disabled="isActivatingProject"
                  @click="handleActivateProject"
                >
                  <app-spinner
                    v-if="isActivatingProject"
                    size="sm"
                  />
                  <template v-else>
                    Activate Project
                  </template>
                </button>
              </div>
            </div>

            <div class="project-detail-progress-copy">
              <strong>{{ completedTaskCount }}/{{ totalTaskCount }} Tasks Completed</strong>
              <span>{{ progressPercent }}%</span>
            </div>

            <div
              class="progress project-detail-progress-bar"
              role="progressbar"
              :aria-valuenow="progressPercent"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="progress-bar"
                :style="{ width: `${progressPercent}%` }"
              />
            </div>
          </header>

          <nav
            class="project-detail-tabs"
            aria-label="Project detail sections"
          >
            <nuxt-link
              v-for="tab in tabs"
              :key="tab.id"
              class="project-detail-tab-link"
              :class="{ 'project-detail-tab-link-active': activeTab === tab.id }"
              :to="buildTabRoute(tab.id)"
            >
              {{ tab.label }}
            </nuxt-link>
          </nav>

          <section
            v-if="activeTab === 'overview'"
            class="project-detail-tab-panel"
          >
            <article class="project-detail-card project-detail-summary-card">
              <div class="project-detail-summary-grid">
                <div class="project-detail-summary-item">
                  <span>Status</span>
                  <workspace-projects-status-badge :status="project.status" />
                </div>

                <div class="project-detail-summary-item">
                  <span>Created By</span>
                  <strong>{{ project.createdByName || 'Unknown' }}</strong>
                </div>

                <div class="project-detail-summary-item">
                  <span>Total Tasks</span>
                  <strong>{{ totalTaskCount }}</strong>
                </div>

                <div class="project-detail-summary-item">
                  <span>Created Date</span>
                  <strong>{{ createdDate }}</strong>
                </div>
              </div>
            </article>

            <article class="project-detail-copy-card">
              <h2>Description</h2>
              <workspace-project-details-rich-text-content :html="supplemental.descriptionHtml" />
            </article>
          </section>

          <section
            v-else-if="activeTab === 'instructions'"
            class="project-detail-tab-panel"
          >
            <article class="project-detail-copy-card">
              <workspace-project-details-rich-text-content :html="supplemental.instructionsHtml" />
            </article>
          </section>

          <section
            v-else-if="activeTab === 'tasks'"
            class="project-detail-tab-panel"
          >
            <workspace-project-details-task-setup-panel
              v-if="showTaskSetup"
              :can-generate="canGenerateTasks"
              :can-save="canSaveTasks"
              :generated-summary="generatedTaskSummary"
              :generating="generatingTasks"
              :has-aoi="Boolean(mapAoi)"
              :maximum-task-area-square-kilometers="PROJECT_WIZARD_TASK_AREA_MAXIMUM"
              :minimum-task-area-square-kilometers="PROJECT_WIZARD_TASK_AREA_MINIMUM"
              :preview-task-count="taskPreviewSummary.totalTasks"
              :project-name="project.name"
              :saved-summary="savedTaskSummary"
              :saving="savingTasks"
              :task-area-square-kilometers="currentTaskAreaSquareKilometers"
              :task-area-step="PROJECT_WIZARD_TASK_AREA_STEP"
              @generate="handleGenerateTasks"
              @reset="resetTasking"
              @save="handleSaveTasks"
              @update:task-area="updateTaskAreaSquareKilometers"
            />

            <workspace-project-details-tasks-tab
              v-else
              :current-user-id="currentUserId"
              :mutating-task-number="mutatingTaskNumber"
              :selected-task-id="selectedTaskId"
              :tasks="displayedTasks"
              :viewer-project-role="effectiveRole"
              @select-task="selectTask"
              @unlock-task="handleUnlockTask"
            />
          </section>

          <section
            v-else-if="activeTab === 'contributions'"
            class="project-detail-tab-panel"
          >
            <workspace-project-details-contributions-tab
              :contributors="supplemental.contributors"
              :metrics="supplemental.contributionMetrics"
            />
          </section>

          <section
            v-else
            class="project-detail-tab-panel"
          >
            <workspace-project-details-contributors-tab
              :can-manage="canManageContributors"
              :adding-contributor="addingContributor"
              :available-users="projectGroupUsers"
              :available-users-loading="projectGroupUsersLoading"
              :contributors="supplemental.contributors"
              :updating-contributor-id="mutatingContributorId"
              @add-contributor="handleAddContributor"
              @open-add-contributor="handleOpenAddContributorDialog"
              @remove-contributor="confirmRemoveContributor"
              @search-available-users="handleSearchAvailableUsers"
              @update-role="handleUpdateContributorRole"
            />
          </section>
        </section>

        <workspace-project-details-project-map
          :aoi="projectAoi"
          :selected-task-id="selectedTaskId"
          :task-grid="showTaskSetup ? displayedTaskGrid : persistedTaskGrid"
          :tasks="showTaskSetup ? [] : displayedTasks"
          class="project-detail-map-column"
          @select-task="selectTask"
        />
      </div>

      <workspace-project-details-selected-task-bar
        v-if="showSelectedTaskBar && selectedTask"
        :action-disabled="selectedTaskActionDisabled"
        :action-label="selectedTaskPrimaryActionLabel"
        :busy="selectedTaskActionBusy"
        :show-action-button="showSelectedTaskActionButton"
        :status-label="selectedTaskStatusLabel"
        :task="selectedTask"
        @action="handleSelectedTaskAction"
        @close="clearSelectedTask"
      />

      <project-wizard-status-dialog
        :visible="Boolean(statusDialog)"
        :variant="statusDialog?.variant ?? 'success'"
        :title="statusDialog?.title ?? ''"
        :message="statusDialog?.message ?? ''"
        :primary-action-label="statusDialog?.primaryActionLabel ?? ''"
        @close="closeStatusDialog"
        @primary-action="handleStatusDialogPrimaryAction"
        @secondary-action="closeStatusDialog"
      />
    </div>
  </app-page>
</template>

<script setup lang="ts">
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import { listProjectGroupUsers } from '~/services/project-wizard-users';
import { normalizeProjectWizardAoiInput } from '~/services/project-wizard-aoi';
import {
  PROJECT_WIZARD_TASK_AREA_MAXIMUM,
  PROJECT_WIZARD_TASK_AREA_MINIMUM,
  PROJECT_WIZARD_TASK_AREA_STEP,
} from '~/services/project-wizard-tasks';
import { tdeiUserClient, workspaceProjectsClient, workspacesClient } from '~/services/index';
import { resolveHttpErrorMessage } from '~/services/http';
import { isTaskSelfValidation } from '~/util/task-access';
import { resolveWorkspaceProjectTaskStatusLabel } from '~/util/task-status';

import type {
  WorkspaceProjectAoiFeature,
  WorkspaceProjectContributor,
  WorkspaceProjectDetail,
  WorkspaceProjectDetailSupplemental,
  WorkspaceProjectDetailTab,
  WorkspaceProjectTaskListItem,
} from '~/types/projects';
import type {
  ProjectWizardAreaFeature,
  ProjectWizardGeneratedTaskFeatureCollection,
  ProjectWizardTaskPreviewFeatureCollection,
  ProjectWizardTaskSaveSummary,
  ProjectWizardWorkspaceUser,
} from '~/types/project-wizard';

interface ProjectDetailTabOption {
  id: WorkspaceProjectDetailTab;
  label: string;
}

const { create } = useModal();
const route = useRoute();
const workspaceId = Number(route.params.id);
const projectId = String(route.params.projectId);
const projectsRoute = `/workspace/${workspaceId}/projects`;

const BASE_TABS: ProjectDetailTabOption[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'contributions', label: 'Contributions' },
];

const workspace = await workspacesClient.getWorkspace(workspaceId);
let projectGroupRolesLoadFailed = false;
const myTdeiRoles = await tdeiUserClient.getMyRolesForProjectGroupById(
  workspace.tdeiProjectGroupId,
).catch(() => {
  projectGroupRolesLoadFailed = true;
  return [];
});
const {
  canEditProjectMetadata,
  canManageProjectLifecycle,
} = useWorkspaceProjectPermissions(
  () => workspace.role,
  myTdeiRoles,
);
const project = ref(await loadProjectDetail());
const projectAoi = ref(await loadProjectAoi());
const projectTasks = ref<WorkspaceProjectTaskListItem[] | null>(await loadProjectTasks());
const projectContributors = ref<WorkspaceProjectContributor[]>(await loadProjectContributors());
const projectGroupUsers = ref<ProjectWizardWorkspaceUser[]>([]);

// Resolve the user's effective project role (workspace lead always wins).
// This is awaited so the tabs and action guards are correct on first render.
const currentUserIdForRole = workspaceProjectsClient.auth.subject || null;
const {
  effectiveRole,
  canValidate,
  canMap,
  canManageContributors,
  promise: rolePromise,
  roleLoadError,
} = useProjectRole(
  workspaceId,
  projectId,
  currentUserIdForRole,
  workspace.role,
);
await rolePromise;
const permissionLoadError = computed(() =>
  (projectGroupRolesLoadFailed && workspace.role !== 'lead')
  || roleLoadError.value !== null,
);

/**
 * Project roles can be managed by workspace leads or project leads.
 * All other tabs are always visible.
 */
const tabs = computed<ProjectDetailTabOption[]>(() => [
  ...BASE_TABS,
  ...(canManageContributors.value ? [{ id: 'contributors' as WorkspaceProjectDetailTab, label: 'Contributors' }] : []),
]);

// The detail API does not expose separate rich-text fields for overview content yet,
// so the page derives its renderable sections from the real project payload.
const supplemental = computed<WorkspaceProjectDetailSupplemental>(() => ({
  descriptionHtml: resolveProjectDescriptionHtml(),
  instructionsHtml: resolveProjectInstructionsHtml(),
  tasks: projectTasks.value ?? [],
  contributors: projectContributors.value,
  contributionMetrics: [],
}));

const displayedTasks = computed(() =>
  projectTasks.value ?? [],
);

const mapAoi = computed<ProjectWizardAreaFeature | null>(() => {
  if (!projectAoi.value) {
    return null;
  }

  try {
    return normalizeProjectWizardAoiInput(projectAoi.value).feature;
  }
  catch {
    return null;
  }
});

const persistedTaskGrid = computed<ProjectWizardGeneratedTaskFeatureCollection | null>(() => {
  const features = displayedTasks.value
    .filter(task => task.geometry)
    .map(task => ({
      type: 'Feature' as const,
      geometry: task.geometry!,
      properties: {
        taskNumber: task.taskNumber,
      },
    }));

  return features.length > 0
    ? {
        type: 'FeatureCollection',
        features,
      }
    : null;
});

const {
  canGenerateTasks,
  canSaveTasks,
  currentTaskAreaSquareKilometers,
  generateTasks,
  generatedTaskGrid,
  generatedTaskSummary,
  generatingTasks,
  resetTasking,
  saveTasks,
  savedTaskGrid,
  savedTaskSummary,
  savingTasks,
  taskPreviewGrid,
  taskPreviewSummary,
  updateTaskAreaSquareKilometers,
} = useProjectTasking({
  aoi: mapAoi,
  projectId: computed(() => String(project.value.id)),
  workspaceId,
});

const activeTab = computed<WorkspaceProjectDetailTab>(() => {
  const requestedTab = route.query.tab;

  if (typeof requestedTab === 'string' && tabs.value.some(tab => tab.id === requestedTab)) {
    return requestedTab as WorkspaceProjectDetailTab;
  }

  return 'overview';
});

// Task generation is only shown for projects that do not yet have persisted tasks.
const showTaskSetup = computed(() =>
  activeTab.value === 'tasks'
  && Array.isArray(projectTasks.value)
  && projectTasks.value.length === 0
  && project.value.taskCount === 0,
);

const displayedTaskGrid = computed<
  ProjectWizardGeneratedTaskFeatureCollection | ProjectWizardTaskPreviewFeatureCollection | null
>(() => {
  // In setup mode, prefer the latest generated or saved preview so the map updates immediately
  // before the follow-up project refresh completes.
  if (showTaskSetup.value) {
    return savedTaskGrid.value
      ?? generatedTaskGrid.value
      ?? taskPreviewGrid.value;
  }

  return persistedTaskGrid.value;
});

const totalTaskCount = computed(() =>
  Math.max(project.value.taskCount, displayedTasks.value.length),
);
// Lock ownership depends on the authenticated tasking user, so the page resolves it once and
// passes only simple booleans/IDs down to child components.
const currentUserId = computed(() => workspaceProjectsClient.auth.subject || null);
const addingContributor = ref(false);
const isActivatingProject = ref(false);
const projectGroupUserSearchQuery = ref('');
const projectGroupUsersLoaded = ref(false);
const projectGroupUsersLoading = ref(false);
const mutatingContributorId = ref<string | null>(null);
const mutatingTaskNumber = ref<number | null>(null);
const selectedTaskId = ref<string | null>(null);
const selectedTask = computed(() =>
  displayedTasks.value.find(task => task.id === selectedTaskId.value) ?? null,
);
const projectRequiresActivation = computed(() => project.value.status === 'draft');
const selectedTaskLockedByCurrentUser = computed(() =>
  Boolean(selectedTask.value?.lock?.user_id)
  && selectedTask.value?.lock?.user_id === currentUserId.value,
);
const selectedTaskStatusLabel = computed(() =>
  selectedTask.value
    ? resolveWorkspaceProjectTaskStatusLabel(selectedTask.value, effectiveRole.value)
    : '',
);
const selectedTaskWasLastMappedByCurrentUser = computed(() =>
  selectedTask.value
    ? isTaskSelfValidation(selectedTask.value, currentUserId.value)
    : false,
);
const showSelectedTaskBar = computed(() =>
  !showTaskSetup.value
  && Boolean(selectedTask.value),
);
const selectedTaskWorkActionLabel = computed(() => {
  if (!selectedTask.value) {
    return 'Map a Task';
  }

  switch (selectedTask.value.status) {
    case 'ready_for_validation':
      return 'Validate Task';
    case 'completed':
      return 'View Task';
    case 'needs_more_mapping':
    case 'ready_for_mapping':
    default:
      return 'Map a Task';
  }
});
const selectedTaskPrimaryActionLabel = computed(() => {
  if (!selectedTask.value) {
    return 'Map a Task';
  }

  if (selectedTask.value.locked) {
    return selectedTaskLockedByCurrentUser.value ? selectedTaskWorkActionLabel.value : 'Task Locked';
  }

  if (selectedTaskWasLastMappedByCurrentUser.value) {
    return 'Cannot Validate Own Mapping';
  }

  return selectedTaskWorkActionLabel.value;
});

const showSelectedTaskActionButton = computed(() => {
  if (!selectedTask.value || projectRequiresActivation.value) {
    return false;
  }

  if (selectedTask.value.status === 'completed') {
    return false;
  }

  if (selectedTask.value.status === 'ready_for_validation') {
    return canValidate.value;
  }

  return canMap.value;
});

const selectedTaskActionDisabled = computed(() =>
  !selectedTask.value
  || mutatingTaskNumber.value === selectedTask.value.taskNumber
  || selectedTaskWasLastMappedByCurrentUser.value
  || (selectedTask.value.locked && !selectedTaskLockedByCurrentUser.value),
);
const selectedTaskActionBusy = computed(() =>
  Boolean(
    selectedTask.value
    && mutatingTaskNumber.value === selectedTask.value.taskNumber,
  ),
);
const showActivateProjectButton = computed(() =>
  projectRequiresActivation.value && canManageProjectLifecycle.value,
);
const showProjectEditButton = computed(() => canEditProjectMetadata.value);

let projectGroupUserSearchDebounce: ReturnType<typeof setTimeout> | undefined;
let projectGroupUserSearchRequestId = 0;

const completedTaskCount = computed(() => {
  const completedTasks = displayedTasks.value.filter(task => task.status === 'completed').length;

  if (project.value.percentCompleted > 0 && totalTaskCount.value > 0) {
    return Math.round((totalTaskCount.value * project.value.percentCompleted) / 100);
  }

  return completedTasks;
});

const progressPercent = computed(() => {
  if (project.value.percentCompleted > 0) {
    return project.value.percentCompleted;
  }

  if (totalTaskCount.value === 0) {
    return 0;
  }

  return Math.round((completedTaskCount.value / totalTaskCount.value) * 100);
});

const createdDate = computed(() =>
  project.value.createdAt.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }),
);

watch(displayedTasks, (tasks) => {
  if (!selectedTaskId.value) {
    return;
  }

  if (!tasks.some(task => task.id === selectedTaskId.value)) {
    selectedTaskId.value = null;
  }
}, { deep: true });

const breadcrumbProjectName = computed(() =>
  project.value.name.length > 24 ? `${project.value.name.slice(0, 24)}...` : project.value.name,
);

useHead({
  title: computed(() => `${project.value.name} | Projects`),
});

function buildTabRoute(tab: WorkspaceProjectDetailTab) {
  return {
    path: `/workspace/${workspaceId}/projects/${projectId}`,
    query: { tab },
  };
}

function buildTaskEditorRoute(taskNumber: number) {
  return {
    path: `/workspace/${workspaceId}/projects/${projectId}/tasks/${taskNumber}/editor`,
  };
}

type StatusDialogState = {
  message: string;
  primaryActionLabel: string;
  primaryActionType: 'dismiss' | 'retry-generate' | 'retry-save';
  title: string;
  variant: 'error' | 'success';
};

const statusDialog = ref<StatusDialogState | null>(null);

onMounted(() => {
  void hydrateProjectDataFromApi();
});

async function handleGenerateTasks() {
  try {
    selectedTaskId.value = null;
    await generateTasks();
  }
  catch (error) {
    await openTaskGenerationErrorDialog(error);
  }
}

async function handleSaveTasks() {
  try {
    const result = await saveTasks();

    if (!result) {
      return;
    }

    // Keep the project summary in sync while the paginated task-list request reloads all tasks.
    project.value.taskCount = result.taskCount;
    await refreshProjectTaskStateAfterSave();
    openTaskSaveSuccessDialog(result);
  }
  catch (error) {
    await openTaskSaveErrorDialog(error);
  }
}

function closeStatusDialog() {
  statusDialog.value = null;
}

function selectTask(taskId: string) {
  selectedTaskId.value = taskId;
}

function clearSelectedTask() {
  selectedTaskId.value = null;
}

async function openProjectEditPage() {
  if (!canEditProjectMetadata.value) {
    return;
  }

  await navigateTo({
    path: `/workspace/${workspaceId}/projects/${projectId}/edit`,
  });
}

async function handleStatusDialogPrimaryAction() {
  const dialog = statusDialog.value;
  closeStatusDialog();

  if (!dialog) {
    return;
  }

  if (dialog.primaryActionType === 'retry-generate') {
    await handleGenerateTasks();
    return;
  }

  if (dialog.primaryActionType === 'retry-save') {
    await handleSaveTasks();
  }
}

async function handleSelectedTaskAction() {
  const taskToOpen = selectedTask.value;

  if (!taskToOpen) {
    return;
  }

  if (isTaskSelfValidation(taskToOpen, currentUserId.value)) {
    return;
  }

  if (taskToOpen.locked) {
    if (!selectedTaskLockedByCurrentUser.value) {
      return;
    }
  }

  if (!taskToOpen.locked) {
    const didLockTask = await lockTaskAndRefreshState(taskToOpen.taskNumber);

    if (!didLockTask) {
      return;
    }
  }

  await navigateTo(buildTaskEditorRoute(taskToOpen.taskNumber));
}

async function handleActivateProject() {
  if (!canManageProjectLifecycle.value) {
    return;
  }

  try {
    isActivatingProject.value = true;

    await workspaceProjectsClient.activateWorkspaceProject(workspaceId, projectId);

    // Re-read the detail endpoint because some tasking endpoints can lag or return stale fields.
    // The page should always pivot off the canonical detail payload before showing task actions.
    project.value = await workspaceProjectsClient.getWorkspaceProjectDetail(workspaceId, projectId);
  }
  catch (error) {
    openTaskLockErrorDialog(await resolveTaskMutationErrorMessage(
      error,
      'Project could not be activated. Please try again.',
    ));
  }
  finally {
    isActivatingProject.value = false;
  }
}

async function loadProjectDetail(): Promise<WorkspaceProjectDetail> {
  try {
    return await workspaceProjectsClient.getWorkspaceProjectDetail(workspaceId, projectId);
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load project details',
      data: error,
    });
  }
}

async function loadProjectAoi(): Promise<WorkspaceProjectAoiFeature | null> {
  try {
    return await workspaceProjectsClient.getWorkspaceProjectAoi(workspaceId, projectId);
  }
  catch {
    return null;
  }
}

async function loadProjectTasks(): Promise<WorkspaceProjectTaskListItem[] | null> {
  try {
    return await workspaceProjectsClient.getWorkspaceProjectTasks(workspaceId, projectId);
  }
  catch {
    return null;
  }
}

async function loadProjectContributors(): Promise<WorkspaceProjectContributor[]> {
  try {
    return await workspaceProjectsClient.getWorkspaceProjectRoles(workspaceId, projectId);
  }
  catch {
    return [];
  }
}

async function refreshProjectTasksOnly() {
  const latestTasks = await workspaceProjectsClient.getWorkspaceProjectTasks(workspaceId, projectId);
  projectTasks.value = latestTasks;
}

async function loadProjectGroupUsers(searchText: string = '') {
  const requestId = ++projectGroupUserSearchRequestId;
  projectGroupUsersLoading.value = true;

  try {
    const users = await listProjectGroupUsers(
      workspace.tdeiProjectGroupId,
      'contributor',
      searchText,
    );

    if (requestId !== projectGroupUserSearchRequestId) {
      return;
    }

    projectGroupUsers.value = users;
    projectGroupUsersLoaded.value = true;
  }
  catch (error) {
    if (requestId === projectGroupUserSearchRequestId) {
      toast.error(await resolveHttpErrorMessage(error, 'Failed to load workspace users'));
    }
  }
  finally {
    if (requestId === projectGroupUserSearchRequestId) {
      projectGroupUsersLoading.value = false;
    }
  }
}

function handleOpenAddContributorDialog() {
  if (!canManageContributors.value) {
    return;
  }

  if (projectGroupUsersLoaded.value || projectGroupUsersLoading.value) {
    return;
  }

  void loadProjectGroupUsers(projectGroupUserSearchQuery.value);
}

function handleSearchAvailableUsers(value: string) {
  if (!canManageContributors.value) {
    return;
  }

  projectGroupUserSearchQuery.value = value;

  if (projectGroupUserSearchDebounce) {
    clearTimeout(projectGroupUserSearchDebounce);
  }

  projectGroupUserSearchDebounce = setTimeout(() => {
    void loadProjectGroupUsers(projectGroupUserSearchQuery.value);
  }, 250);
}

async function handleAddContributor(payload: {
  role: WorkspaceProjectContributor['role'];
  userId: string;
}) {
  // A project has one lead, established when the project is created. The add-contributor
  // workflow may grant tasking roles but must never create another project lead.
  if (!canManageContributors.value || payload.role === 'lead') {
    return;
  }

  if (projectContributors.value.some(contributor => contributor.id === payload.userId)) {
    return;
  }

  addingContributor.value = true;

  try {
    await workspaceProjectsClient.addWorkspaceProjectRole(workspaceId, projectId, payload);
    projectContributors.value = await workspaceProjectsClient.getWorkspaceProjectRoles(workspaceId, projectId);
  }
  catch (error) {
    toast.error(await resolveHttpErrorMessage(error, 'Failed to add contributor'));
  }
  finally {
    addingContributor.value = false;
  }
}

async function confirmRemoveContributor(contributor: WorkspaceProjectContributor) {
  if (!canManageContributors.value || contributor.role === 'lead') {
    return;
  }

  const value = await create({
    title: 'Remove Contributor',
    body: `Remove ${contributor.name} from this project?`,
    okTitle: 'Remove',
    okVariant: 'danger',
    cancelTitle: 'Cancel',
    cancelClass: 'btn-link p-0',
    cancelVariant: null,
  }).show();

  if (!value?.ok) {
    return;
  }

  mutatingContributorId.value = contributor.id;

  try {
    await workspaceProjectsClient.deleteWorkspaceProjectRole(workspaceId, projectId, contributor.id);
    projectContributors.value = projectContributors.value.filter(
      item => item.id !== contributor.id,
    );
  }
  catch (error) {
    toast.error(await resolveHttpErrorMessage(error, 'Failed to remove contributor'));
  }
  finally {
    mutatingContributorId.value = null;
  }
}

async function handleUpdateContributorRole(payload: {
  contributorId: string;
  role: WorkspaceProjectContributor['role'];
}) {
  if (!canManageContributors.value) {
    return;
  }

  const existingContributor = projectContributors.value.find(
    contributor => contributor.id === payload.contributorId,
  );

  if (
    !existingContributor
    || existingContributor.role === 'lead'
    || payload.role === 'lead'
    || existingContributor.role === payload.role
  ) {
    return;
  }

  const previousRole = existingContributor.role;
  const previousUpdatedAt = existingContributor.updatedAt;

  projectContributors.value = projectContributors.value.map((contributor) => {
    if (contributor.id !== payload.contributorId) {
      return contributor;
    }

    return {
      ...contributor,
      role: payload.role,
      updatedAt: new Date(),
    };
  });

  mutatingContributorId.value = payload.contributorId;

  try {
    await workspaceProjectsClient.updateWorkspaceProjectRole(
      workspaceId,
      projectId,
      payload.contributorId,
      payload.role,
    );
    projectContributors.value = await workspaceProjectsClient.getWorkspaceProjectRoles(workspaceId, projectId);
  }
  catch (error) {
    projectContributors.value = projectContributors.value.map((contributor) => {
      if (contributor.id !== payload.contributorId) {
        return contributor;
      }

      return {
        ...contributor,
        role: previousRole,
        updatedAt: previousUpdatedAt,
      };
    });

    toast.error(await resolveHttpErrorMessage(error, 'Failed to update contributor role'));
  }
  finally {
    mutatingContributorId.value = null;
  }
}

onBeforeUnmount(() => {
  if (projectGroupUserSearchDebounce) {
    clearTimeout(projectGroupUserSearchDebounce);
  }
});

async function hydrateProjectDataFromApi() {
  // Refresh independent resources concurrently so one failure does not wipe out the rest.
  const [projectResult, aoiResult, tasksResult, contributorsResult] = await Promise.allSettled([
    workspaceProjectsClient.getWorkspaceProjectDetail(workspaceId, projectId),
    workspaceProjectsClient.getWorkspaceProjectAoi(workspaceId, projectId),
    workspaceProjectsClient.getWorkspaceProjectTasks(workspaceId, projectId),
    workspaceProjectsClient.getWorkspaceProjectRoles(workspaceId, projectId),
  ]);

  if (projectResult.status === 'fulfilled') {
    project.value = projectResult.value;
  }

  if (aoiResult.status === 'fulfilled') {
    projectAoi.value = aoiResult.value;
  }

  if (tasksResult.status === 'fulfilled') {
    projectTasks.value = tasksResult.value;
  }

  if (contributorsResult.status === 'fulfilled') {
    projectContributors.value = contributorsResult.value;
  }
}

async function refreshProjectTaskStateAfterSave() {
  try {
    // After save, reload the canonical task list so the page exits setup mode and the
    // normal tasks tab and persisted grid take over.
    await hydrateProjectDataFromApi();
  }
  catch {
    // Keep the saved grid visible in setup mode if the follow-up refresh fails.
  }
}

async function lockTaskAndRefreshState(taskNumber: number) {
  try {
    mutatingTaskNumber.value = taskNumber;

    await workspaceProjectsClient.lockWorkspaceProjectTask(
      workspaceId,
      projectId,
      taskNumber,
    );
    // Lock mutations can affect more than the lock object itself, so immediately re-read the
    // full task list from the tasks endpoint instead of patching one local row optimistically.
    await refreshProjectTasksOnly();
    return true;
  }
  catch (error) {
    openTaskLockErrorDialog(await resolveTaskMutationErrorMessage(
      error,
      'Task could not be locked. Please try again.',
    ));
    return false;
  }
  finally {
    mutatingTaskNumber.value = null;
  }
}

async function handleUnlockTask(taskNumber: number) {
  try {
    mutatingTaskNumber.value = taskNumber;
    await workspaceProjectsClient.unlockWorkspaceProjectTask(workspaceId, projectId, taskNumber);
    // Unlock does not currently return a full task payload, so re-fetch the canonical list.
    await refreshProjectTasksOnly();
  }
  catch (error) {
    openTaskLockErrorDialog(await resolveTaskMutationErrorMessage(
      error,
      'Task could not be unlocked. Please try again.',
    ));
  }
  finally {
    mutatingTaskNumber.value = null;
  }
}

function openTaskSaveSuccessDialog(result: ProjectWizardTaskSaveSummary) {
  statusDialog.value = {
    variant: 'success',
    title: 'Tasks saved',
    message: `${result.taskCount} tasks are now available for this project.`,
    primaryActionLabel: 'Continue',
    primaryActionType: 'dismiss',
  };
}

async function openTaskGenerationErrorDialog(error: unknown) {
  statusDialog.value = {
    variant: 'error',
    title: 'Generate failed',
    message: await resolveHttpErrorMessage(
      error,
      'Tasks could not be generated. Please try again.',
    ),
    primaryActionLabel: 'Try Again',
    primaryActionType: 'retry-generate',
  };
}

async function openTaskSaveErrorDialog(error: unknown) {
  statusDialog.value = {
    variant: 'error',
    title: 'Save failed',
    message: await resolveHttpErrorMessage(
      error,
      'Tasks could not be saved. Please try again.',
    ),
    primaryActionLabel: 'Try Again',
    primaryActionType: 'retry-save',
  };
}

function openTaskLockErrorDialog(message: string) {
  statusDialog.value = {
    variant: 'error',
    title: 'Task update failed',
    message,
    primaryActionLabel: 'Close',
    primaryActionType: 'dismiss',
  };
}

async function resolveTaskMutationErrorMessage(error: unknown, fallbackMessage: string) {
  return await resolveHttpErrorMessage(error, fallbackMessage);
}

function resolveProjectDescriptionHtml() {
  if (project.value.description?.trim()) {
    return `<p>${escapeHtml(project.value.description)}</p>`;
  }

  return '<p>Project description is not available.</p>';
}

function resolveProjectInstructionsHtml() {
  if (project.value.instructions.trim()) {
    return project.value.instructions;
  }

  return '<p>Project instructions are not available.</p>';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-detail-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - #{$navbar-height});
  overflow: hidden;
}

.project-detail-layout {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.project-detail-shell {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 50%) minmax(0, 50%);
  height: 100%;
  min-height: 0;
  background: $surface-card;
  border: 1px solid rgba($text-navy, 0.12);
  border-radius: 0;
  overflow: hidden;
}

.project-detail-shell-with-footer {
  border-bottom: 0;
  border-radius: 1rem 1rem 0 0;
}

.project-detail-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: $surface-card;
  overflow-y: auto;
}

.project-detail-hero {
  padding: 2.2rem 2.5rem 2rem;
  background: linear-gradient(283deg, $hero-gradient-start 0%, $hero-gradient-end 100%);
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.project-detail-breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-bottom: 1.25rem;
  color: $text-secondary;
  font-size: 0.875rem;
  font-weight: 500;
}

.project-detail-breadcrumbs a {
  color: inherit;
  text-decoration: none;
}

.project-detail-breadcrumbs a:hover {
  color: #495174;
}

.project-detail-title {
  max-width: 44rem;
  margin: 0;
  color: $text-navy;
  font-size: 1.625rem;
  font-weight: 600;
  line-height: 1.4;
}

.project-detail-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.project-detail-hero-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.project-detail-edit-button {
  width: 2.625rem;
  height: 2.625rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #4d158d;
  background: $primary-soft;
  border: 1px solid rgba(77, 21, 141, 0.28);
  border-radius: 0.5rem;
  box-shadow: 0 0.4rem 1rem rgba(77, 21, 141, 0.08);
}

.project-detail-edit-button:hover:not(:disabled),
.project-detail-edit-button:focus-visible:not(:disabled) {
  color: $primary-hover;
  background: rgba(255, 255, 255, 0.94);
  border-color: rgba(77, 21, 141, 0.42);
}

.project-detail-edit-button:disabled {
  opacity: 0.6;
}

.project-detail-activate-button {
  height: 2.625rem;
  padding: 0 0.9375rem;
  flex-shrink: 0;
  color: $white;
  font-size: 0.98rem;
  font-weight: 600;
  background: $primary;
  border: 1px solid $primary;
  border-radius: 0.5rem;
}

.project-detail-activate-button:hover:not(:disabled),
.project-detail-activate-button:focus-visible:not(:disabled) {
  color: $white;
  background: $primary-hover;
  border-color: $primary-hover;
}

.project-detail-activate-button:disabled {
  opacity: 0.62;
}

.project-detail-progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2.3rem;
  color: $text-secondary;
  font-size: 0.875rem;
  font-weight: 500;
}

.project-detail-progress-copy strong {
  color: $text-secondary;
  font-weight: 500;
}

.project-detail-progress-bar {
  height: 0.625rem;
  margin-top: 0.55rem;
  background: $surface-card;
  border: 1px solid $progress-border;
  border-radius: 1.25rem;
}

.project-detail-progress-bar .progress-bar {
  background: $progress-fill;
  border-radius: 999px;
}

.project-detail-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 1.55rem;
  padding: 1.35rem 2.5rem 0;
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.project-detail-tab-link {
  position: relative;
  padding-bottom: 1rem;
  color: $text-secondary;
  font-size: 1rem;
  text-decoration: none;
}

.project-detail-tab-link-active {
  color: $text-navy;
  font-weight: 700;
}

.project-detail-tab-link-active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 0.22rem;
  background: $text-navy;
  border-radius: 999px;
}

.project-detail-tab-panel {
  padding: 2rem 2.5rem 2.5rem;
}

.project-detail-card,
.project-detail-copy-card {
  background: $surface-card;
}

.project-detail-summary-card {
  padding: 1.25rem;
  border: 1px solid $border-subtle;
  border-radius: 1rem;
  margin-bottom: 1.875rem;
}

.project-detail-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.4rem 2rem;
}

.project-detail-summary-item {
  display: flex;
  gap: 0.9375rem;
  min-width: 0;
}

.project-detail-summary-item span {
  font-size: 1rem;
  font-weight: 600;
  min-width: 7.5rem;
}

.project-detail-summary-item strong {
  flex: 1;
  min-width: 0;
  color: $text-secondary;
  font-size: 1rem;
  font-weight: 400;
  overflow-wrap: anywhere;
}

.project-detail-copy-card {
  margin-top: 0;
}

.project-detail-copy-card h2 {
  margin-bottom: 0.75rem;
  color: $text-navy;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
}

.project-detail-map-column {
  min-width: 0;
  height: 100%;
}

@include media-breakpoint-down(xl) {
  .project-detail-hero,
  .project-detail-tabs,
  .project-detail-tab-panel {
    padding-left: 1.75rem;
    padding-right: 1.75rem;
  }
}

@include media-breakpoint-down(lg) {
  .project-detail-page {
    height: auto;
    overflow: visible;
  }

  .project-detail-shell {
    grid-template-columns: 1fr;
    height: auto;
  }

  .project-detail-layout {
    display: block;
  }

  .project-detail-content {
    overflow: visible;
  }
}

@include media-breakpoint-down(md) {
  .project-detail-hero {
    padding-top: 1.6rem;
    padding-bottom: 1.5rem;
  }

  .project-detail-title-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .project-detail-hero-actions {
    width: 100%;
  }

  .project-detail-title {
    font-size: 1.5rem;
  }

  .project-detail-summary-grid {
    grid-template-columns: 1fr;
  }
}

@include media-breakpoint-down(sm) {
  .project-detail-hero,
  .project-detail-tabs,
  .project-detail-tab-panel {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .project-detail-tabs {
    gap: 1rem;
  }

  .project-detail-copy-card,
  .project-detail-summary-card {
    padding: 1rem;
  }
}
</style>
