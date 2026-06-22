<template>
  <app-page fluid class="project-detail-page">
    <div
      class="project-detail-shell"
      :class="{ 'project-detail-shell-tasks': activeTab === 'tasks' }"
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
            :selected-task-id="selectedTaskId"
            :tasks="displayedTasks"
            @select-task="selectTask"
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
const selectedTaskId = ref<string | null>(null);

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

    if (!selectedTaskId.value) {
      selectedTaskId.value = tasksResult.value[0]?.id ?? null;
    }
  }
}

async function refreshProjectTaskStateAfterSave() {
  try {
    // After save, reload the canonical task list so the page exits setup mode and the
    // normal tasks tab and persisted grid take over.
    await hydrateProjectDataFromApi();

    if (projectTasks.value && projectTasks.value.length > 0) {
      selectedTaskId.value = projectTasks.value[0].id;
    }
  }
  catch {
    // Keep the saved grid visible in setup mode if the follow-up refresh fails.
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
}
</style>
