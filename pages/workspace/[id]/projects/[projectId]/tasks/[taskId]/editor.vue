<template>
  <app-page
    fluid
    padding="none"
    class="task-editor-page"
  >
    <section
      class="task-editor-shell"
      :class="isSidebarOpen ? 'task-editor-shell-sidebar-open' : 'task-editor-shell-sidebar-closed'"
    >
      <div
        ref="editorContainer"
        class="task-editor-canvas"
      />

      <task-editor-sidebar
        v-model:feedback-notes="feedbackNotes"
        v-model:feedback-reason-category="feedbackReasonCategory"
        v-model:review-decision="reviewDecision"
        :action-status-blocked="isActionStatusBlocked"
        :action-status-message="completeTaskStatusMessage"
        :actions="taskActions"
        :editor-load-error-message="editorLoadErrorMessage"
        :feedback-reason-options="feedbackReasonOptions"
        :feedback="task.feedback"
        :instructions="project.instructions"
        :lock-time-remaining="lockTimeRemaining"
        :open="isSidebarOpen"
        :project-name="project.name"
        :review-task="isReviewTask"
        :show-action-status="showActionStatus"
        :sidebar-id="taskEditorSidebarId"
        :submit-error-message="submitErrorMessage"
        :task-label="task.label"
        :task-status-help-text="taskStatusHelpText"
        :task-status-label="taskStatusLabel"
        @action="handleTaskAction"
        @back="handleBackNavigation"
        @toggle="toggleSidebar"
      />
    </section>

    <app-confirmation-dialog
      :visible="showUnsavedEditsDialog"
      title="You have unsaved edits"
      :message="unsavedEditsMessage"
      primary-action-label="Leave anyway"
      primary-variant="danger"
      secondary-action-label="Stay on page"
      @primary-action="confirmLeaveWithUnsavedEdits"
      @secondary-action="cancelLeaveWithUnsavedEdits"
      @close="cancelLeaveWithUnsavedEdits"
    />
  </app-page>
</template>

<script setup lang="ts">
import { rapid3Manager, rapidManager, workspaceProjectsClient } from '~/services/index';
import { WorkspaceProjectsClientError } from '~/services/projects';
import type {
  WorkspaceProjectDetail,
  WorkspaceProjectTaskDetail,
} from '~/types/projects';
import type { TaskEditorActionId } from '~/types/task-editor';
import { shapeToCenter } from '~/util/geojson';

const route = useRoute();
const workspaceId = Number(route.params.id);
const projectId = String(route.params.projectId);
const taskId = String(route.params.taskId);
const editorContainer = ref<HTMLDivElement | null>(null);
const manager = rapidManager;
const pendingEditCount = ref(0);
const isSidebarOpen = ref(true);
const hasActiveEdits = computed(() => pendingEditCount.value > 0);
const taskEditorSidebarId = 'task-editor-sidebar';
const editorLoadErrorMessage = ref('');
const showUnsavedEditsDialog = ref(false);
const pendingUnsavedAction = ref<'route' | 'skip' | null>(null);
const newApiUrl = import.meta.env.VITE_NEW_API_URL;
let allowNextRouteLeave = false;
let resolvePendingRouteLeave: ((shouldLeave: boolean) => void) | null = null;

const [project, task] = await Promise.all([
  loadProjectDetail(),
  loadTaskDetail(),
]);

const {
  buildFeedbackPayload,
  feedbackNotes,
  feedbackReasonCategory,
  feedbackReasonOptions,
  isReviewTask,
  reviewDecision,
  reviewFeedbackIsIncomplete,
  taskStatusHelpText,
  taskStatusLabel,
} = useTaskEditorContext(() => task.apiStatus);
const { timeRemaining: lockTimeRemaining } = useTaskLockCountdown(
  () => task.lock?.expires_at,
);
const {
  actions: taskActions,
  actionStatusMessage: completeTaskStatusMessage,
  attachUploadedChangeset,
  completeTaskBlockedReason,
  releaseTask,
  showActionStatus,
  submitErrorMessage,
  submitTask,
} = useTaskEditorSubmission({
  buildFeedbackPayload,
  hasActiveEdits,
  isReviewTask,
  onFinished: finishTaskEditor,
  pendingEditCount,
  projectId,
  reviewFeedbackIsIncomplete,
  taskNumber: task.taskNumber,
  workspaceId,
});

const backToTasksRoute = computed(() => ({
  path: `/workspace/${workspaceId}/projects/${projectId}`,
  query: { tab: 'tasks' },
}));
const isActionStatusBlocked = computed(() =>
  Boolean(completeTaskBlockedReason.value),
);
const unsavedEditsMessage = computed(() => {
  const editLabel = pendingEditCount.value === 1 ? 'edit' : 'edits';
  return `You have ${pendingEditCount.value} active ${editLabel} that will be discarded if you leave. Are you sure?`;
});

useHead({
  title: `${project.name} | ${task.label} Editor`,
});

onBeforeRouteLeave(() => {
  if (allowNextRouteLeave) {
    allowNextRouteLeave = false;
    return true;
  }

  if (!hasActiveEdits.value) {
    return true;
  }

  resolvePendingRouteLeave?.(false);
  pendingUnsavedAction.value = 'route';
  showUnsavedEditsDialog.value = true;

  return new Promise<boolean>((resolve) => {
    resolvePendingRouteLeave = resolve;
  });
});

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasActiveEdits.value) {
    return;
  }

  event.preventDefault();
  event.returnValue = '';
}

let stopLoadedWatch: (() => void) | null = null;
let stopStateChangeListener: (() => void) | null = null;
let stopUploadResultListener: (() => void) | null = null;

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);

  if (window.matchMedia('(max-width: 991.98px)').matches) {
    isSidebarOpen.value = false;
  }

  stopStateChangeListener = manager.onStateChange((state) => {
    pendingEditCount.value = normalizePendingEditCount(state);
  });
  stopUploadResultListener = manager.onUploadResult((result) => {
    const nextChangesetId = extractChangesetId(result);

    if (nextChangesetId === null) {
      console.warn('Rapid upload succeeded but no changeset ID was found in the result.', result);
      return;
    }
    void attachUploadedChangeset(nextChangesetId);
  });

  // Rapid 2 and Rapid 3 both expose a global `Rapid` namespace. Even though this page
  // now always uses RapidManager, we still hard-reload if Rapid 3 was initialized first.
  const otherManager = rapid3Manager;

  if (otherManager?.loaded.value) {
    window.location.reload();
    return;
  }

  syncTaskHash();

  if (!manager.loaded.value) {
    stopLoadedWatch = watch(manager.loaded, (isLoaded) => {
      if (!isLoaded) {
        return;
      }

      editorLoadErrorMessage.value = '';
      void mountEditor().catch(error => handleEditorLoadFailure('initialize', error));
      stopLoadedWatch?.();
      stopLoadedWatch = null;
    });

    manager.load();
    return;
  }

  if (!editorContainer.value) {
    return;
  }

  editorContainer.value.appendChild(manager.containerNode);
  editorLoadErrorMessage.value = '';
  void manager.switchWorkspace(workspaceId, project.customImagery)
    .catch(error => handleEditorLoadFailure('switch', error));
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  stopLoadedWatch?.();
  stopStateChangeListener?.();
  stopUploadResultListener?.();
});

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

async function loadTaskDetail(): Promise<WorkspaceProjectTaskDetail> {
  try {
    return await workspaceProjectsClient.getWorkspaceProjectTaskDetail(
      workspaceId,
      projectId,
      taskId,
    );
  }
  catch (error) {
    const fallbackTaskDetail = await loadTaskDetailByTaskNumber(taskId, error);

    if (fallbackTaskDetail) {
      return fallbackTaskDetail;
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load task details',
      data: error,
    });
  }
}

async function loadTaskDetailByTaskNumber(
  taskIdentifier: string,
  error: unknown,
): Promise<WorkspaceProjectTaskDetail | null> {
  if (!(error instanceof WorkspaceProjectsClientError) || error.response.status !== 404) {
    return null;
  }

  const taskNumber = Number(taskIdentifier);

  if (!Number.isInteger(taskNumber) || taskNumber < 1) {
    return null;
  }

  const tasks = await workspaceProjectsClient.getWorkspaceProjectTasks(workspaceId, projectId);
  const matchedTask = tasks.find(candidate => candidate.taskNumber === taskNumber);

  if (!matchedTask) {
    return null;
  }

  return await workspaceProjectsClient.getWorkspaceProjectTaskDetail(
    workspaceId,
    projectId,
    matchedTask.id,
  );
}
function handleBackNavigation() {
  void navigateTo(backToTasksRoute.value);
}

function confirmLeaveWithUnsavedEdits() {
  const action = pendingUnsavedAction.value;
  showUnsavedEditsDialog.value = false;
  pendingUnsavedAction.value = null;

  if (action === 'route') {
    resolvePendingRouteLeave?.(true);
    resolvePendingRouteLeave = null;
  }
  else if (action === 'skip') {
    void releaseTask();
  }
}

function cancelLeaveWithUnsavedEdits() {
  showUnsavedEditsDialog.value = false;
  pendingUnsavedAction.value = null;
  resolvePendingRouteLeave?.(false);
  resolvePendingRouteLeave = null;
}

function handleTaskAction(actionId: TaskEditorActionId) {
  if (actionId === 'complete') {
    if (hasActiveEdits.value) {
      return;
    }

    void submitTask();
    return;
  }

  if (hasActiveEdits.value) {
    pendingUnsavedAction.value = 'skip';
    showUnsavedEditsDialog.value = true;
    return;
  }

  void releaseTask();
}

function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value;
}

async function finishTaskEditor(bypassUnsavedGuard: boolean) {
  allowNextRouteLeave = bypassUnsavedGuard;

  try {
    await navigateTo(backToTasksRoute.value);
  }
  finally {
    allowNextRouteLeave = false;
  }
}

function normalizePendingEditCount(state: unknown) {
  if (typeof state !== 'number' || Number.isNaN(state)) {
    return 0;
  }

  return Math.max(0, Math.trunc(state));
}

function extractChangesetId(result: unknown): number | null {
  const candidates: unknown[] = [];

  if (typeof result === 'number' || typeof result === 'string') {
    candidates.push(result);
  }

  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    candidates.push(
      record.changesetId,
      record.changesetID,
      record.changeset_id,
      record.id,
    );

    if (record.changeset && typeof record.changeset === 'object') {
      const changeset = record.changeset as Record<string, unknown>;
      candidates.push(
        changeset.id,
        changeset.changesetId,
        changeset.changesetID,
        changeset.changeset_id,
      );
    }
  }

  for (const candidate of candidates) {
    const parsed = normalizeChangesetId(candidate);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function normalizeChangesetId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function generateInitialHash() {
  const center = shapeToCenter(task.geometry);
  const lat = center[0];
  const lon = center[1];
  const zoom = 17;
  const boundaryUrl = new URL(
    `workspaces/${workspaceId}/tasking/projects/${projectId}/tasks/${task.taskNumber}/boundary.geojson`,
    newApiUrl,
  ).toString();
  const dataUrl = boundaryUrl;
  const customImagerySource = project.customImagery || null;
  if (customImagerySource) {
    return `#map=${zoom}/${lat}/${lon}&data=${dataUrl}&background=${customImagerySource.id}`;
  }
  return `#map=${zoom}/${lat}/${lon}&data=${dataUrl}`;
}

function syncTaskHash() {
  if (!task.geometry) {
    return;
  }

  const initialHash = generateInitialHash();
  const nextUrl = `${window.location.pathname}${window.location.search}${initialHash}`;
  window.history.replaceState(window.history.state, '', nextUrl);
}

async function mountEditor() {
  if (!editorContainer.value) {
    throw new Error('Rapid editor container is unavailable.');
  }

  editorContainer.value.appendChild(manager.containerNode);
  await manager.init(workspaceId, project.customImagery);
}

function handleEditorLoadFailure(action: 'initialize' | 'switch', error: unknown) {
  console.error(`Failed to ${action} Rapid`, error);
  editorLoadErrorMessage.value = action === 'initialize'
    ? 'Rapid could not start. Refresh the page to try again, or return to Tasks.'
    : 'Rapid could not load this workspace. Refresh the page to try again, or return to Tasks.';
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.task-editor-page {
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: $purple-background-light;
}

.task-editor-shell {
  --task-editor-sidebar-width: min(34rem, 32vw);
  --task-editor-sidebar-rail-width: 3.75rem;
  height: 100%;
  min-height: 0;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--task-editor-sidebar-width);
  overflow: hidden;
}

.task-editor-shell.task-editor-shell-sidebar-closed {
  grid-template-columns: minmax(0, 1fr) var(--task-editor-sidebar-rail-width);
}

.task-editor-canvas {
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: $text-navy;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

@include media-breakpoint-down(lg) {
  .task-editor-shell {
    --task-editor-sidebar-width: min(28rem, 40vw);
    --task-editor-sidebar-rail-width: 3.5rem;
  }
}

@include media-breakpoint-down(sm) {
  .task-editor-shell {
    --task-editor-sidebar-width: min(25rem, calc(100vw - 3.25rem));
    --task-editor-sidebar-rail-width: 3.25rem;
  }
}
</style>
