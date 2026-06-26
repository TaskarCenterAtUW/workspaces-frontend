<template>
  <app-page fluid class="project-detail-page">
    <div class="project-detail-layout">
      <div
        class="project-detail-shell"
        :class="{
          'project-detail-shell-with-footer': showSelectedTaskBar,
        }"
      >
        <section class="project-detail-content">
          <header class="project-detail-hero">
            <nav class="project-detail-breadcrumbs" aria-label="Breadcrumb">
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

              <button
                v-if="showActivateProjectButton"
                class="btn project-detail-activate-button"
                type="button"
                :disabled="isActivatingProject"
                @click="handleActivateProject"
              >
                <app-spinner v-if="isActivatingProject" size="sm" />
                <template v-else>
                  Activate Project
                </template>
              </button>
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
              <div class="progress-bar" :style="{ width: `${progressPercent}%` }" />
            </div>
          </header>

          <nav class="project-detail-tabs" aria-label="Project detail sections">
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

          <section v-if="activeTab === 'overview'" class="project-detail-tab-panel">
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

          <section v-else-if="activeTab === 'instructions'" class="project-detail-tab-panel">
            <article class="project-detail-copy-card">
              <workspace-project-details-rich-text-content :html="supplemental.instructionsHtml" />
            </article>
          </section>

          <section v-else-if="activeTab === 'tasks'" class="project-detail-tab-panel">
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

          <section v-else-if="activeTab === 'contributions'" class="project-detail-tab-panel">
            <workspace-project-details-contributions-tab
              :contributors="supplemental.contributors"
              :metrics="supplemental.contributionMetrics"
            />
          </section>

          <section v-else class="project-detail-tab-panel">
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
        :status-label="formatTaskStatus(selectedTask)"
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
import { workspaceProjectsClient, workspacesClient } from '~/services/index';
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
  isProjectLead,
  isExplicitProjectLead,
  canValidate,
  canMap,
  canManageContributors,
} = await useProjectRole(
  workspaceId,
  projectId,
  currentUserIdForRole,
  workspace.role,
);

/**
 * The Contributors tab is only visible to project leads.
 * All other tabs are always visible.
 */
const tabs = computed<ProjectDetailTabOption[]>(() => [
  ...BASE_TABS,
  ...(isExplicitProjectLead.value ? [{ id: 'contributors' as WorkspaceProjectDetailTab, label: 'Contributors' }] : []),
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
const showSelectedTaskBar = computed(() =>
  activeTab.value === 'tasks'
  && !showTaskSetup.value
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
  || (selectedTask.value.locked && !selectedTaskLockedByCurrentUser.value),
);
const selectedTaskActionBusy = computed(() =>
  Boolean(
    selectedTask.value
    && mutatingTaskNumber.value === selectedTask.value.taskNumber,
  ),
);
const showActivateProjectButton = computed(() =>
  projectRequiresActivation.value && isProjectLead.value,
);

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
    openTaskGenerationErrorDialog(error);
  }
}

async function handleSaveTasks() {
  try {
    const result = await saveTasks();

    if (!result) {
      return;
    }

    await refreshProjectTaskStateAfterSave();
    openTaskSaveSuccessDialog(result);
  }
  catch (error) {
    openTaskSaveErrorDialog(error);
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
      toast.error(error instanceof Error ? error.message : 'Failed to load workspace users');
    }
  }
  finally {
    if (requestId === projectGroupUserSearchRequestId) {
      projectGroupUsersLoading.value = false;
    }
  }
}

function handleOpenAddContributorDialog() {
  if (projectGroupUsersLoaded.value || projectGroupUsersLoading.value) {
    return;
  }

  void loadProjectGroupUsers(projectGroupUserSearchQuery.value);
}

function handleSearchAvailableUsers(value: string) {
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
  if (projectContributors.value.some(contributor => contributor.id === payload.userId)) {
    return;
  }

  addingContributor.value = true;

  try {
    await workspaceProjectsClient.addWorkspaceProjectRole(workspaceId, projectId, payload);
    projectContributors.value = await workspaceProjectsClient.getWorkspaceProjectRoles(workspaceId, projectId);
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Failed to add contributor');
  }
  finally {
    addingContributor.value = false;
  }
}

async function confirmRemoveContributor(contributor: WorkspaceProjectContributor) {
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
    toast.error(error instanceof Error ? error.message : 'Failed to remove contributor');
  }
  finally {
    mutatingContributorId.value = null;
  }
}

async function handleUpdateContributorRole(payload: {
  contributorId: string;
  role: WorkspaceProjectContributor['role'];
}) {
  const existingContributor = projectContributors.value.find(
    contributor => contributor.id === payload.contributorId,
  );

  if (!existingContributor || existingContributor.role === payload.role) {
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

    toast.error(error instanceof Error ? error.message : 'Failed to update contributor role');
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
  // Refresh the independent project, AOI, and task resources opportunistically so one
  // failed request does not wipe out the rest of the page state.
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

function openTaskGenerationErrorDialog(error: unknown) {
  statusDialog.value = {
    variant: 'error',
    title: 'Generate failed',
    message: error instanceof Error
      ? error.message
      : 'Tasks could not be generated. Please try again.',
    primaryActionLabel: 'Try Again',
    primaryActionType: 'retry-generate',
  };
}

function openTaskSaveErrorDialog(error: unknown) {
  statusDialog.value = {
    variant: 'error',
    title: 'Save failed',
    message: error instanceof Error
      ? error.message
      : 'Tasks could not be saved. Please try again.',
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

function formatTaskStatus(task: Pick<WorkspaceProjectTaskListItem, 'locked' | 'status'>) {
  return resolveWorkspaceProjectTaskStatusLabel(task, effectiveRole.value);
}

async function resolveTaskMutationErrorMessage(error: unknown, fallbackMessage: string) {
  if (!(error instanceof Error) || !('response' in error)) {
    return fallbackMessage;
  }

  const response = (error as { response?: Response }).response;

  if (!response) {
    return fallbackMessage;
  }

  try {
    // FastAPI-style validation errors come back in `detail[]`, so prefer that over the generic
    // HTTP status text when present.
    const body = await response.clone().json() as {
      detail?: Array<{ msg?: string }> | string;
    };

    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail;
    }

    if (Array.isArray(body.detail) && body.detail[0]?.msg) {
      return body.detail[0].msg;
    }
  }
  catch {
    // Fall back to the generic message when the API does not return a parseable JSON body.
  }

  return error.message || fallbackMessage;
}

function resolveProjectDescriptionHtml() {
  if (project.value.summary?.trim()) {
    return `<p>${escapeHtml(project.value.summary)}</p>`;
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
  padding-top: 1rem !important;
  padding-bottom: 1rem !important;
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
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.12);
  border-radius: 1rem;
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
  background: #ffffff;
  overflow-y: auto;
}

.project-detail-hero {
  padding: 2.2rem 2.5rem 2rem;
  background:
    radial-gradient(circle at top left, rgba(244, 240, 251, 0.98), rgba(244, 240, 251, 0.7) 44%, rgba(244, 240, 251, 0.28) 100%),
    linear-gradient(180deg, #faf8fe 0%, #f7f3fc 100%);
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.project-detail-breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-bottom: 1.25rem;
  color: #757d98;
  font-size: 1rem;
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
  color: #1a1e3d;
  font-family: var(--secondary-font-family);
  font-size: clamp(1rem, 2vw, 2rem);
  font-weight: 600;
  line-height: 1.18;
  letter-spacing: -0.03em;
}

.project-detail-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.project-detail-activate-button {
  min-width: 10.5rem;
  min-height: 2.85rem;
  padding-inline: 1.15rem;
  flex-shrink: 0;
  color: #ffffff;
  font-size: 0.98rem;
  font-weight: 700;
  background: #4d158d;
  border: 1px solid #4d158d;
  border-radius: 0.6rem;
}

.project-detail-activate-button:hover:not(:disabled),
.project-detail-activate-button:focus-visible:not(:disabled) {
  color: #ffffff;
  background: #421178;
  border-color: #421178;
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
  color: #5f647a;
  font-size: 1.1rem;
}

.project-detail-progress-copy strong {
  color: #5f647a;
  font-weight: 500;
}

.project-detail-progress-bar {
  height: 0.45rem;
  margin-top: 0.55rem;
  background: #e4e7f5;
}

.project-detail-progress-bar .progress-bar {
  background: #4e5fe0;
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
  color: #5a607b;
  font-size: 1.1rem;
  text-decoration: none;
}

.project-detail-tab-link-active {
  color: #1a1e3d;
  font-weight: 700;
}

.project-detail-tab-link-active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 0.22rem;
  background: #1a1e3d;
  border-radius: 999px;
}

.project-detail-tab-panel {
  padding: 2rem 2.5rem 2.5rem;
}

.project-detail-card,
.project-detail-copy-card {
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 1rem;
  box-shadow: 0 0.75rem 2rem rgba($text-navy, 0.08);
}

.project-detail-summary-card {
  padding: 1.55rem;
}

.project-detail-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.4rem 2rem;
}

.project-detail-summary-item {
  display: grid;
  gap: 0.45rem;
}

.project-detail-summary-item span {
  color: #1a1e3d;
  font-size: 1.05rem;
  font-weight: 700;
}

.project-detail-summary-item strong {
  color: #5a607b;
  font-size: 1.05rem;
  font-weight: 400;
}

.project-detail-copy-card {
  margin-top: 1.35rem;
  padding: 1.75rem;
}

.project-detail-copy-card h2 {
  margin: 0 0 1.35rem;
  color: #1a1e3d;
  font-family: var(--secondary-font-family);
  font-size: 1.4rem;
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

  .project-detail-title {
    font-size: 2.2rem;
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
