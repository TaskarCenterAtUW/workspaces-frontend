<template>
  <app-page fluid class="project-detail-page">
    <div
      class="project-detail-shell"
      :class="{
        'project-detail-shell-tasks': activeTab === 'tasks',
        'project-detail-shell-task-selected': showSelectedTaskBar,
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

          <h2 class="project-detail-title">
            {{ project.name }}
          </h2>

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
            @select-task="selectTask"
            @unlock-task="handleUnlockTask"
          />
        </section>

        <section v-else class="project-detail-tab-panel">
          <workspace-project-details-contributions-tab
            :contributors="supplemental.contributors"
            :metrics="supplemental.contributionMetrics"
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

      <section
        v-if="showSelectedTaskBar && selectedTask"
        class="project-detail-task-action-bar"
        aria-label="Selected task actions"
      >
        <button
          class="btn btn-link project-detail-task-action-close"
          type="button"
          @click="clearSelectedTask"
        >
          <app-icon variant="close" size="20" no-margin />
          Close
        </button>

        <div class="project-detail-task-action-summary">
          <div class="project-detail-task-action-copy">
            <span>Selected Task</span>
            <strong>{{ selectedTask.label }}</strong>
          </div>

          <div class="project-detail-task-action-status">
            <span>Current Status</span>
            <strong>
              <span
                class="project-detail-task-action-status-swatch"
                :class="`project-detail-task-action-status-${selectedTask.status}`"
              />
              {{ formatTaskStatus(selectedTask.status) }}
            </strong>
          </div>
        </div>

        <button
          class="btn project-detail-task-action-primary"
          type="button"
          :disabled="selectedTaskActionDisabled"
          @click="handleSelectedTaskAction"
        >
          <app-spinner
            v-if="isActivatingProject || mutatingTaskNumber === selectedTask.taskNumber"
            size="sm"
          />
          <template v-else>
            {{ selectedTaskPrimaryActionLabel }}
          </template>
        </button>
      </section>
    </div>
  </app-page>
</template>

<script setup lang="ts">
import { normalizeProjectWizardAoiInput } from '~/services/project-wizard-aoi';
import {
  PROJECT_WIZARD_TASK_AREA_MAXIMUM,
  PROJECT_WIZARD_TASK_AREA_MINIMUM,
  PROJECT_WIZARD_TASK_AREA_STEP,
} from '~/services/project-wizard-tasks';
import { workspaceProjectsClient, workspacesClient } from '~/services/index';

import type {
  WorkspaceProjectAoiFeature,
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
} from '~/types/project-wizard';

interface ProjectDetailTabOption {
  id: WorkspaceProjectDetailTab;
  label: string;
}

const route = useRoute();
const workspaceId = Number(route.params.id);
const projectId = String(route.params.projectId);
const projectsRoute = `/workspace/${workspaceId}/projects`;

const tabs: ProjectDetailTabOption[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'contributions', label: 'Contributions' },
];

const workspace = await workspacesClient.getWorkspace(workspaceId);
const project = ref(await loadProjectDetail());
const projectAoi = ref(await loadProjectAoi());
const projectTasks = ref<WorkspaceProjectTaskListItem[] | null>(await loadProjectTasks());

// The detail API does not expose separate rich-text fields for overview content yet,
// so the page derives its renderable sections from the real project payload.
const supplemental = computed<WorkspaceProjectDetailSupplemental>(() => ({
  descriptionHtml: resolveProjectDescriptionHtml(),
  instructionsHtml: resolveProjectInstructionsHtml(),
  tasks: projectTasks.value ?? [],
  contributors: [],
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

  if (typeof requestedTab === 'string' && tabs.some(tab => tab.id === requestedTab)) {
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
const isActivatingProject = ref(false);
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

  if (projectRequiresActivation.value) {
    return 'Activate Project';
  }

  if (selectedTask.value.locked) {
    return selectedTaskLockedByCurrentUser.value ? selectedTaskWorkActionLabel.value : 'Task Locked';
  }

  return selectedTaskWorkActionLabel.value;
});
const selectedTaskActionDisabled = computed(() =>
  !selectedTask.value
  || isActivatingProject.value
  || mutatingTaskNumber.value === selectedTask.value.taskNumber
  || (selectedTask.value.locked && !selectedTaskLockedByCurrentUser.value),
);

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

function buildTaskEditorRoute(taskId: string) {
  return {
    path: `/workspace/${workspaceId}/projects/${projectId}/tasks/${taskId}/editor`,
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

  if (projectRequiresActivation.value) {
    await handleActivateProject();
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

  await navigateTo(buildTaskEditorRoute(taskToOpen.id));
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

async function refreshProjectTasksOnly() {
  const latestTasks = await workspaceProjectsClient.getWorkspaceProjectTasks(workspaceId, projectId);
  projectTasks.value = latestTasks;
}

async function hydrateProjectDataFromApi() {
  // Refresh the independent project, AOI, and task resources opportunistically so one
  // failed request does not wipe out the rest of the page state.
  const [projectResult, aoiResult, tasksResult] = await Promise.allSettled([
    workspaceProjectsClient.getWorkspaceProjectDetail(workspaceId, projectId),
    workspaceProjectsClient.getWorkspaceProjectAoi(workspaceId, projectId),
    workspaceProjectsClient.getWorkspaceProjectTasks(workspaceId, projectId),
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

function formatTaskStatus(status: WorkspaceProjectTaskListItem['status']) {
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
  height: calc(100vh - #{$navbar-height});
  padding-top: 1rem !important;
  padding-bottom: 1rem !important;
  overflow: hidden;
}

.project-detail-shell {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 44%) minmax(0, 56%);
  height: 100%;
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.12);
  border-radius: 1rem;
  overflow: hidden;
}

.project-detail-shell-tasks {
  grid-template-columns: minmax(0, 48%) minmax(0, 52%);
}

.project-detail-shell-task-selected .project-detail-content,
.project-detail-shell-task-selected .project-detail-map-column {
  padding-bottom: 6.6rem;
  box-sizing: border-box;
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

.project-detail-task-action-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 4;
  min-height: 6.6rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1rem 2.2rem;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1px solid rgba($text-navy, 0.12);
  box-shadow: 0 -0.6rem 1.8rem rgba($text-navy, 0.08);
  backdrop-filter: blur(8px);
}

.project-detail-task-action-close {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0;
  color: #db4b4b;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
}

.project-detail-task-action-close:hover,
.project-detail-task-action-close:focus-visible {
  color: #c93c3c;
}

.project-detail-task-action-summary {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2rem;
}

.project-detail-task-action-copy,
.project-detail-task-action-status {
  display: grid;
  gap: 0.28rem;
  min-width: 0;
}

.project-detail-task-action-copy span,
.project-detail-task-action-status span {
  color: #707796;
  font-size: 0.95rem;
}

.project-detail-task-action-copy strong,
.project-detail-task-action-status strong {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: #1a1e3d;
  font-size: 1.1rem;
  font-weight: 700;
}

.project-detail-task-action-status {
  padding-left: 1.8rem;
  border-left: 1px solid rgba($text-navy, 0.12);
}

.project-detail-task-action-status-swatch {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  border: 1px solid rgba(90, 96, 123, 0.12);
}

.project-detail-task-action-status-ready_for_mapping {
  background: #fde9aa;
}

.project-detail-task-action-status-ready_for_validation {
  background: #a8d8f8;
}

.project-detail-task-action-status-needs_more_mapping {
  background: #f8be90;
}

.project-detail-task-action-status-completed {
  background: #aae8cd;
}

.project-detail-task-action-primary {
  min-width: 11.5rem;
  min-height: 3.35rem;
  padding-inline: 1.5rem;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 700;
  background: #4d158d;
  border: 1px solid #4d158d;
  border-radius: 0.55rem;
}

.project-detail-task-action-primary:hover:not(:disabled),
.project-detail-task-action-primary:focus-visible:not(:disabled) {
  color: #ffffff;
  background: #421178;
  border-color: #421178;
}

.project-detail-task-action-primary:disabled {
  opacity: 0.62;
}

@include media-breakpoint-down(xl) {
  .project-detail-shell {
    grid-template-columns: minmax(0, 48%) minmax(0, 52%);
  }

  .project-detail-shell-tasks {
    grid-template-columns: minmax(0, 52%) minmax(0, 48%);
  }

  .project-detail-hero,
  .project-detail-tabs,
  .project-detail-tab-panel {
    padding-left: 1.75rem;
    padding-right: 1.75rem;
  }

  .project-detail-task-action-bar {
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

  .project-detail-content {
    overflow: visible;
  }

  .project-detail-shell-task-selected .project-detail-content,
  .project-detail-shell-task-selected .project-detail-map-column {
    padding-bottom: 0;
  }

  .project-detail-task-action-bar {
    position: static;
    flex-wrap: wrap;
    padding: 1rem 1.75rem;
  }

  .project-detail-task-action-summary {
    justify-content: flex-start;
  }
}

@include media-breakpoint-down(md) {
  .project-detail-hero {
    padding-top: 1.6rem;
    padding-bottom: 1.5rem;
  }

  .project-detail-title {
    font-size: 2.2rem;
  }

  .project-detail-summary-grid {
    grid-template-columns: 1fr;
  }

  .project-detail-task-action-summary {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .project-detail-task-action-status {
    padding-left: 0;
    border-left: 0;
  }
}

@include media-breakpoint-down(sm) {
  .project-detail-shell {
    min-height: auto;
  }

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

  .project-detail-task-action-bar {
    padding: 1rem;
  }

  .project-detail-task-action-primary {
    width: 100%;
  }
}
</style>
