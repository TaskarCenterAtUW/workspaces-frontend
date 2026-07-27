<template>
  <app-page
    fluid
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

      <aside
        :id="taskEditorSidebarId"
        class="task-editor-sidebar"
        :class="{ 'task-editor-sidebar-open': isSidebarOpen }"
        aria-label="Task editor details"
      >
        <button
          class="task-editor-sidebar-handle"
          type="button"
          :aria-controls="taskEditorSidebarId"
          :aria-expanded="isSidebarOpen"
          :aria-label="isSidebarOpen ? 'Hide task details panel' : 'Show task details panel'"
          @click="toggleSidebar"
        >
          <app-icon
            :variant="isSidebarOpen ? 'chevron_right' : 'chevron_left'"
            size="20"
            no-margin
          />
        </button>

        <div class="task-editor-sidebar-scroll">
          <header class="task-editor-sidebar-hero">
            <button
              class="btn btn-link task-editor-back"
              type="button"
              @click="handleBackNavigation"
            >
              <app-icon
                variant="chevron_left"
                size="20"
                no-margin
              />
              Go back
            </button>

            <h1 class="task-editor-title">
              {{ project.name }}
            </h1>

            <div class="task-editor-task-summary">
              <strong>{{ task.label }}</strong>
              <div class="task-editor-task-badges">
                <span class="task-editor-status">{{ taskStatusLabel }}</span>
                <span
                  v-if="lockTimeRemaining"
                  class="task-editor-lock-time"
                >
                  <app-icon
                    variant="schedule"
                    size="17"
                    no-margin
                  />
                  {{ lockTimeRemaining }}
                </span>
              </div>
            </div>

            <p
              v-if="editorLoadErrorMessage"
              class="task-editor-load-error"
              role="alert"
            >
              {{ editorLoadErrorMessage }}
            </p>
          </header>

          <div
            class="task-editor-tabs"
            role="tablist"
            aria-label="Task editor sections"
          >
            <button
              id="task-editor-completion-tab"
              class="task-editor-tab"
              :class="{ 'task-editor-tab-active': activeSidebarTab === 'completion' }"
              type="button"
              role="tab"
              :aria-selected="activeSidebarTab === 'completion'"
              aria-controls="task-editor-completion-panel"
              @click="activeSidebarTab = 'completion'"
            >
              Completion
            </button>
            <button
              id="task-editor-instructions-tab"
              class="task-editor-tab"
              :class="{ 'task-editor-tab-active': activeSidebarTab === 'instructions' }"
              type="button"
              role="tab"
              :aria-selected="activeSidebarTab === 'instructions'"
              aria-controls="task-editor-instructions-panel"
              @click="activeSidebarTab = 'instructions'"
            >
              Instructions
            </button>
          </div>

          <section
            v-if="activeSidebarTab === 'completion'"
            id="task-editor-completion-panel"
            class="task-editor-tab-panel"
            role="tabpanel"
            aria-labelledby="task-editor-completion-tab"
          >
            <div class="task-editor-info-card">
              <span class="task-editor-info-icon">
                <app-icon
                  variant="info"
                  size="22"
                  no-margin
                />
              </span>
              <div>
                <h2>Task status</h2>
                <p>{{ taskStatusHelpText }}</p>
              </div>
            </div>

            <section
              v-if="!isReviewTask"
              class="task-editor-completion-section task-editor-mapping-completion"
            >
              <h2>Ready to finish mapping?</h2>
              <p>
                Push your edits in Rapid before marking this task as done. You can skip the task to
                release the lock without submitting it.
              </p>
            </section>

            <section
              v-if="isReviewTask"
              class="task-editor-completion-section task-editor-review"
            >
              <fieldset class="task-editor-feedback-group">
                <legend class="task-editor-feedback-legend">Review this mapping</legend>
                <label
                  class="task-editor-feedback-option"
                  :class="{ 'task-editor-feedback-option-selected': reviewDecision === 'approve' }"
                >
                  <input
                    v-model="reviewDecision"
                    class="visually-hidden"
                    type="radio"
                    name="task-editor-review-decision"
                    value="approve"
                  >
                  <span>Approve</span>
                </label>
                <label
                  class="task-editor-feedback-option"
                  :class="{ 'task-editor-feedback-option-selected': reviewDecision === 'remap' }"
                >
                  <input
                    v-model="reviewDecision"
                    class="visually-hidden"
                    type="radio"
                    name="task-editor-review-decision"
                    value="remap"
                  >
                  <span>Request remap</span>
                </label>
              </fieldset>

              <div
                v-if="reviewDecision === 'remap'"
                class="task-editor-feedback-fields"
              >
                <label
                  class="task-editor-field-label"
                  for="task-editor-feedback-reason"
                >
                  Reason
                </label>
                <app-select
                  id="task-editor-feedback-reason"
                  v-model="feedbackReasonCategory"
                  class="task-editor-feedback-select"
                  :options="feedbackReasonOptions"
                  placeholder="Select a reason"
                  aria-label="Select a remap reason"
                />

                <label
                  class="task-editor-field-label"
                  for="task-editor-feedback-notes"
                >
                  Notes
                </label>
                <textarea
                  id="task-editor-feedback-notes"
                  v-model="feedbackNotes"
                  class="form-control task-editor-field task-editor-feedback-notes"
                  rows="5"
                  placeholder="Describe what the mapper needs to fix"
                  required
                />
                <p class="task-editor-feedback-hint">
                  A reason and notes are required to request a remap.
                </p>
              </div>
            </section>
          </section>

          <section
            v-else
            id="task-editor-instructions-panel"
            class="task-editor-tab-panel task-editor-instructions"
            role="tabpanel"
            aria-labelledby="task-editor-instructions-tab"
          >
            <div class="task-editor-section-heading">
              <h2>Instructions</h2>
            </div>
            <workspace-project-details-rich-text-content
              class="task-editor-rich-copy"
              :html="project.instructions"
            />
          </section>
        </div>

        <footer class="task-editor-sidebar-footer">
          <section class="task-editor-sidebar-section task-editor-actions">
            <p
              v-if="submitErrorMessage"
              class="task-editor-submit-error"
              aria-live="polite"
            >
              {{ submitErrorMessage }}
            </p>

            <div
              v-if="showActionStatus"
              class="task-editor-action-status"
              :class="{
                'task-editor-action-status-blocked': Boolean(completeTaskBlockedReason)
              }"
              aria-live="polite"
            >
              <app-icon
                :variant="completeTaskBlockedReason ? 'info' : 'check_circle'"
                size="18"
                no-margin
              />
              <span>{{ completeTaskStatusMessage }}</span>
            </div>

            <div class="task-editor-action-list">
              <button
                v-for="action in taskActions"
                :key="action.id"
                class="btn task-editor-action-button"
                :class="`btn-${action.variant}`"
                type="button"
                :disabled="isTaskActionDisabled(action.id)"
                @click="handleTaskAction(action.id)"
              >
                {{ getTaskActionLabel(action.id, action.label) }}
              </button>
            </div>
          </section>
        </footer>
      </aside>
    </section>

    <app-confirmation-dialog
      :visible="showUnsavedEditsDialog"
      title="You have unsaved edits"
      :message="`You have ${pendingEditCount} active ${pendingEditCount === 1 ? 'edit' : 'edits'} that will be discarded if you leave. Are you sure?`"
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
import { resolveHttpErrorMessage } from '~/services/http';
import { WorkspaceProjectsClientError } from '~/services/projects';
import type {
  WorkspaceProjectDetail,
  WorkspaceProjectTaskDetail,
  WorkspaceProjectTaskFeedbackReasonCategory,
  WorkspaceProjectTaskSubmitFeedback,
} from '~/types/projects';
import { shapeToCenter } from '~/util/geojson';

const route = useRoute();
const workspaceId = Number(route.params.id);
const projectId = String(route.params.projectId);
const taskId = String(route.params.taskId);
const editorContainer = ref<HTMLDivElement | null>(null);
const manager = rapidManager;
const pendingEditCount = ref(0);
const isSidebarOpen = ref(true);
const activeSidebarTab = ref<'completion' | 'instructions'>('completion');
const hasActiveEdits = computed(() => pendingEditCount.value > 0);
const taskEditorSidebarId = 'task-editor-sidebar';
const feedbackNotes = ref('');
const feedbackReasonCategory = ref<WorkspaceProjectTaskFeedbackReasonCategory | ''>('');
const reviewDecision = ref<'approve' | 'remap'>('approve');
const isSubmittingTask = ref(false);
const isSubmittingChangeset = ref(false);
const activeTaskAction = ref<'complete' | 'skip' | null>(null);
const submitErrorMessage = ref('');
const editorLoadErrorMessage = ref('');
const showUnsavedEditsDialog = ref(false);
const pendingUnsavedAction = ref<'route' | 'skip' | null>(null);
const pendingChangesetId = ref<number | null>(null);
const uploadedChangesetId = ref(-1);
const lockClock = ref(Date.now());
const newApiUrl = import.meta.env.VITE_NEW_API_URL;
let allowNextRouteLeave = false;
let resolvePendingRouteLeave: ((shouldLeave: boolean) => void) | null = null;
let lockCountdownTimer: ReturnType<typeof setInterval> | null = null;

const [project, task] = await Promise.all([
  loadProjectDetail(),
  loadTaskDetail(),
]);

const feedbackReasonOptions: Array<{
  label: string;
  value: WorkspaceProjectTaskFeedbackReasonCategory;
}> = [
  { label: 'Incomplete Mapping', value: 'incomplete_mapping' },
  { label: 'Data Quality Issue', value: 'data_quality_issue' },
  { label: 'Wrong Area', value: 'wrong_area' },
  { label: 'Other', value: 'other' },
];
const trimmedFeedbackNotes = computed(() => feedbackNotes.value.trim());
const isReviewTask = computed(() =>
  task.apiStatus === 'to_review' || task.apiStatus === 'to_validate',
);
const isRemapTask = computed(() =>
  task.apiStatus === 'to_remap' || task.apiStatus === 'more_mapping_needed',
);
const taskStatusLabel = computed(() => {
  if (isReviewTask.value) {
    return 'TO REVIEW';
  }

  if (isRemapTask.value) {
    return 'MORE MAPPING REQUIRED';
  }

  return task.apiStatus === 'completed' || task.apiStatus === 'done'
    ? 'COMPLETED'
    : 'TO MAP';
});
const taskStatusHelpText = computed(() => {
  if (isReviewTask.value) {
    return 'Approve the completed mapping or request a remap with clear feedback.';
  }

  if (isRemapTask.value) {
    return 'Complete the additional mapping required, push your edits in Rapid, and submit the task again.';
  }

  return 'Complete the mapping in Rapid, push your edits, and submit when the task is ready.';
});
const lockTimeRemaining = computed(() =>
  formatLockTimeRemaining(task.lock?.expires_at, lockClock.value),
);
const reviewFeedbackIsIncomplete = computed(() =>
  isReviewTask.value
  && reviewDecision.value === 'remap'
  && (!feedbackReasonCategory.value || !trimmedFeedbackNotes.value),
);
const taskActions = computed(() => [
  { id: 'skip' as const, label: 'Skip Task', variant: 'outline-secondary' },
  {
    id: 'complete' as const,
    label: isReviewTask.value ? 'Submit Review' : 'I’m Done Mapping',
    variant: 'primary',
  },
]);
const completeTaskBlockedReason = computed(() => {
  if (isSubmittingTask.value) {
    return 'Task submission is in progress.';
  }

  if (isSubmittingChangeset.value && pendingChangesetId.value !== null) {
    return `Attaching uploaded changeset #${pendingChangesetId.value} to this task.`;
  }

  if (hasActiveEdits.value) {
    const editLabel = pendingEditCount.value === 1 ? 'edit' : 'edits';
    return `Push or discard your ${pendingEditCount.value} active ${editLabel} in Rapid before completing this task.`;
  }

  if (pendingChangesetId.value !== null) {
    return `Uploaded changeset #${pendingChangesetId.value} has not been attached to this task yet. Please upload again before completing.`;
  }

  if (reviewFeedbackIsIncomplete.value) {
    return 'Select a reason and add notes before requesting a remap.';
  }

  return '';
});
const completeTaskStatusMessage = computed(() => {
  if (completeTaskBlockedReason.value) {
    return completeTaskBlockedReason.value;
  }

  if (uploadedChangesetId.value > 0) {
    return `Last uploaded changeset #${uploadedChangesetId.value} will be attached when you complete this task.`;
  }

  return isReviewTask.value
    ? 'Approve the mapping or request a remap with feedback.'
    : 'Push your edits in Rapid, then complete this task.';
});
const showActionStatus = computed(() =>
  Boolean(completeTaskBlockedReason.value) || uploadedChangesetId.value > 0,
);

const backToTasksRoute = computed(() => ({
  path: `/workspace/${workspaceId}/projects/${projectId}`,
  query: { tab: 'tasks' },
}));

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

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  lockCountdownTimer = setInterval(() => {
    lockClock.value = Date.now();
  }, 60_000);

  if (window.matchMedia('(max-width: 991.98px)').matches) {
    isSidebarOpen.value = false;
  }

  manager.onStateChange((state) => {
    pendingEditCount.value = normalizePendingEditCount(state);
  });
  manager.onUploadResult((result) => {
    const nextChangesetId = extractChangesetId(result);

    if (nextChangesetId === null) {
      console.warn('Rapid upload succeeded but no changeset ID was found in the result.', result);
      return;
    }
    pendingChangesetId.value = nextChangesetId;
    void submitLatestUploadedChangeset(nextChangesetId);
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
  if (lockCountdownTimer) {
    clearInterval(lockCountdownTimer);
    lockCountdownTimer = null;
  }
  stopLoadedWatch?.();
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
    void skipTask();
  }
}

function cancelLeaveWithUnsavedEdits() {
  showUnsavedEditsDialog.value = false;
  pendingUnsavedAction.value = null;
  resolvePendingRouteLeave?.(false);
  resolvePendingRouteLeave = null;
}

function handleTaskAction(actionId: 'complete' | 'skip') {
  if (actionId === 'complete') {
    if (hasActiveEdits.value) {
      return;
    }

    void submitCompletedMapping();
    return;
  }

  if (hasActiveEdits.value) {
    pendingUnsavedAction.value = 'skip';
    showUnsavedEditsDialog.value = true;
    return;
  }

  void skipTask();
}

function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value;
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

function isTaskActionDisabled(actionId: 'complete' | 'skip') {
  if (isSubmittingTask.value || isSubmittingChangeset.value || activeTaskAction.value !== null) {
    return true;
  }

  return actionId === 'complete'
    ? hasActiveEdits.value || pendingChangesetId.value !== null || reviewFeedbackIsIncomplete.value
    : false;
}

function getTaskActionLabel(actionId: 'complete' | 'skip', fallback: string) {
  if (actionId === 'complete' && isSubmittingTask.value) {
    return 'Submitting...';
  }

  if (actionId === 'skip' && activeTaskAction.value === 'skip') {
    return 'Skipping...';
  }

  return fallback;
}

function buildFeedbackPayload(): WorkspaceProjectTaskSubmitFeedback | undefined {
  if (!isReviewTask.value || reviewDecision.value === 'approve') {
    return undefined;
  }

  if (!feedbackReasonCategory.value) {
    throw new Error('Select a feedback reason before requesting a remap.');
  }

  if (!trimmedFeedbackNotes.value) {
    throw new Error('Add feedback notes before requesting a remap.');
  }

  return {
    notes: trimmedFeedbackNotes.value,
    reasonCategory: feedbackReasonCategory.value,
  };
}

function formatLockTimeRemaining(expiresAt: string | undefined, currentTime: number) {
  if (!expiresAt) {
    return '';
  }

  const remainingMilliseconds = new Date(expiresAt).getTime() - currentTime;

  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) {
    return 'Lock expired';
  }

  const remainingMinutes = Math.ceil(remainingMilliseconds / 60_000);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  if (hours === 0) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
  }

  return `${hours} ${hours === 1 ? 'hour' : 'hours'}, ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
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

async function submitCompletedMapping() {
  submitErrorMessage.value = '';

  let feedback: WorkspaceProjectTaskSubmitFeedback | undefined;

  try {
    feedback = buildFeedbackPayload();
  }
  catch (error) {
    submitErrorMessage.value = error instanceof Error
      ? error.message
      : 'Feedback validation failed.';
    return;
  }

  isSubmittingTask.value = true;
  activeTaskAction.value = 'complete';

  try {
    await workspaceProjectsClient.submitWorkspaceProjectTask(
      workspaceId,
      projectId,
      task.taskNumber,
      {
        done: true,
        feedback,
      },
    );

    await navigateTo(backToTasksRoute.value);
  }
  catch (error) {
    submitErrorMessage.value = await getTaskSubmitErrorMessage(error);
  }
  finally {
    isSubmittingTask.value = false;
    activeTaskAction.value = null;
  }
}

async function submitLatestUploadedChangeset(osmChangesetId: number) {
  isSubmittingChangeset.value = true;
  submitErrorMessage.value = '';

  try {
    await workspaceProjectsClient.submitWorkspaceProjectTaskChangeset(
      workspaceId,
      projectId,
      task.taskNumber,
      osmChangesetId,
    );

    uploadedChangesetId.value = osmChangesetId;

    if (pendingChangesetId.value === osmChangesetId) {
      pendingChangesetId.value = null;
    }
  }
  catch {
    submitErrorMessage.value = `Uploaded changeset #${osmChangesetId} could not be attached to this task. Please upload again before completing.`;
  }
  finally {
    isSubmittingChangeset.value = false;
  }
}

async function skipTask() {
  submitErrorMessage.value = '';
  activeTaskAction.value = 'skip';

  try {
    await workspaceProjectsClient.unlockWorkspaceProjectTask(
      workspaceId,
      projectId,
      task.taskNumber,
    );

    allowNextRouteLeave = true;

    try {
      await navigateTo(backToTasksRoute.value);
    }
    finally {
      allowNextRouteLeave = false;
    }
  }
  catch (error) {
    submitErrorMessage.value = await getTaskSubmitErrorMessage(error);
  }
  finally {
    activeTaskAction.value = null;
  }
}

async function getTaskSubmitErrorMessage(error: unknown) {
  return await resolveHttpErrorMessage(error, 'Task submission failed.');
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

$review-option-color: #1a1e3d;

.task-editor-page {
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0 !important;
  background: $purple-background-light;
}

.task-editor-shell {
  --task-editor-sidebar-width: min(34rem, 32vw);
  --task-editor-sidebar-rail-width: 3.75rem;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--task-editor-sidebar-width);
  position: relative;
  overflow: hidden;
}

.task-editor-shell.task-editor-shell-sidebar-closed {
  grid-template-columns: minmax(0, 1fr) var(--task-editor-sidebar-rail-width);
}

.task-editor-canvas,
.task-editor-sidebar {
  min-height: 0;
}

.task-editor-canvas {
  height: 100%;
  overflow: hidden;
  background: $text-navy;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.task-editor-sidebar {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: visible;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  border-left: 1px solid rgba($text-navy, 0.1);
  box-shadow: -0.5rem 0 1.5rem rgba($text-navy, 0.08);
  transition:
    width 0.28s ease,
    box-shadow 0.28s ease;
  background: $white;
}

.task-editor-sidebar:not(.task-editor-sidebar-open) {
  box-shadow: -0.2rem 0 1rem rgba($text-navy, 0.04);
}

.task-editor-load-error {
  margin: 0.85rem 0 0;
  padding: 0.75rem;
  color: $danger-red;
  font-size: 0.9rem;
  line-height: 1.45;
  background: rgba($white, 0.92);
  border: 1px solid rgba($danger-red, 0.28);
  border-radius: 0.75rem;
}

.task-editor-sidebar-scroll {
  height: 100%;
  display: grid;
  align-content: start;
  gap: 0;
  padding: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  transition: opacity 0.16s ease;
}

.task-editor-sidebar:not(.task-editor-sidebar-open) .task-editor-sidebar-scroll {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  overflow: hidden;
}

.task-editor-sidebar-footer {
  position: sticky;
  bottom: 0;
  display: grid;
  gap: 0;
  padding: 1rem 1.75rem 1.25rem;
  background: $white;
  border-top: 1px solid rgba($text-navy, 0.1);
}

.task-editor-sidebar:not(.task-editor-sidebar-open) .task-editor-sidebar-footer {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.task-editor-sidebar-handle {
  position: absolute;
  top: 2rem;
  left: 0.9rem;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 3.15rem;
  color: $text-navy;
  background: $white;
  border: 1px solid rgba($text-navy, 0.14);
  border-radius: 0.65rem;
  box-shadow: $box-shadow;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    left 0.28s ease,
    transform 0.28s ease;
}

.task-editor-sidebar-handle:hover,
.task-editor-sidebar-handle:focus-visible {
  color: $white;
  background: $primary;
  box-shadow:
    0 0 0 0.38rem rgba($primary, 0.2),
    $box-shadow;
}

.task-editor-sidebar.task-editor-sidebar-open .task-editor-sidebar-handle {
  left: 0;
  transform: translateX(-50%);
}

.task-editor-sidebar:not(.task-editor-sidebar-open) .task-editor-sidebar-handle {
  left: 50%;
  transform: translateX(-50%);
}

.task-editor-title {
  margin: 0;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 1.65rem;
  font-weight: 700;
  line-height: 1.3;
}

.task-editor-status {
  width: fit-content;
  margin: 0;
  padding: 0.35rem 0.6rem;
  color: $primary;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  background: rgba($primary, 0.08);
  border-radius: 999px;
}

.task-editor-sidebar-hero {
  display: grid;
  gap: 1.25rem;
  padding: 1.75rem;
  background: $purple-background-light;
}

.task-editor-task-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1rem;
  color: $secondary;
  border-top: 1px dashed rgba($text-navy, 0.25);
}

.task-editor-task-badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.task-editor-lock-time {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  color: #8a6300;
  font-size: 0.82rem;
  font-weight: 600;
  background: #fffaf0;
  border: 1px solid #ead9ad;
  border-radius: 999px;
}

.task-editor-tabs {
  display: flex;
  gap: 1.75rem;
  padding: 1.25rem 1.75rem 0;
  background: $white;
  border-bottom: 0.25rem solid rgba($primary, 0.08);
}

.task-editor-tab {
  position: relative;
  padding: 0 0 0.75rem;
  color: $secondary;
  font-size: 1rem;
  font-weight: 600;
  background: transparent;
  border: 0;
}

.task-editor-tab::after {
  position: absolute;
  right: 0;
  bottom: -0.25rem;
  left: 0;
  height: 0.25rem;
  content: "";
  background: transparent;
}

.task-editor-tab:hover,
.task-editor-tab:focus-visible,
.task-editor-tab-active {
  color: $text-navy;
}

.task-editor-tab-active::after {
  background: $text-navy;
}

.task-editor-tab-panel {
  display: grid;
  align-content: start;
  gap: 1.75rem;
  padding: 1.5rem 1.75rem 2rem;
}

.task-editor-info-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.85rem;
  padding: 1rem;
  background: #fbfcff;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 0.8rem;
}

.task-editor-info-card h2,
.task-editor-info-card p {
  margin: 0;
}

.task-editor-info-card h2 {
  color: $text-navy;
  font-size: 1rem;
  font-weight: 700;
}

.task-editor-info-card p {
  margin-top: 0.25rem;
  color: $secondary;
  font-size: 0.93rem;
  line-height: 1.45;
}

.task-editor-info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  color: $secondary;
  background: $purple-background-light;
  border-radius: 50%;
}

.task-editor-completion-section {
  display: grid;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba($text-navy, 0.1);
}

.task-editor-mapping-completion h2,
.task-editor-mapping-completion p {
  margin: 0;
}

.task-editor-mapping-completion h2 {
  color: $text-navy;
  font-size: 1.2rem;
  font-weight: 700;
}

.task-editor-mapping-completion p {
  color: $secondary;
  line-height: 1.5;
}

.task-editor-sidebar-section {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  background: $white;
  border: 1px solid rgba($text-navy, 0.08);
  border-radius: 1.1rem;
  box-shadow: 0 0.8rem 2rem rgba($text-navy, 0.05);
}

.task-editor-section-heading {
  display: grid;
  gap: 0.3rem;
}

.task-editor-section-heading h2 {
  margin: 0;
  color: $text-navy;
  font-size: 1.25rem;
  font-weight: 700;
}

.task-editor-section-heading span {
  color: $secondary;
  font-size: 0.88rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.task-editor-instructions {
  display: grid;
  gap: 0.85rem;
}

.task-editor-rich-copy {
  color: $secondary;
  font-size: 1rem;
  line-height: 1.55;
}

.task-editor-actions {
  display: grid;
  gap: 0.9rem;
  position: relative;
  z-index: 1;
  padding: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.task-editor-review {
  display: grid;
  gap: 0.9rem;
}

.task-editor-feedback-fields,
.task-editor-feedback-group {
  display: grid;
  gap: 0.75rem;
}

.task-editor-field-label,
.task-editor-feedback-legend {
  margin: 0;
  color: $text-navy;
  font-size: 0.85rem;
  font-weight: 700;
}

.task-editor-feedback-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 0;
  margin: 0;
  border: 0;
}

.task-editor-feedback-legend {
  flex: 0 0 100%;
  margin-bottom: 0.25rem;
  font-size: 1.2rem;
}

.task-editor-field {
  color: $text-navy;
  background: $white;
  border-color: rgba($text-navy, 0.14);
  border-radius: 0.85rem;
}

.task-editor-field:focus {
  border-color: rgba($primary, 0.4);
  box-shadow: 0 0 0 0.2rem rgba($primary, 0.12);
}

.task-editor-feedback-notes {
  min-height: 7rem;
  resize: vertical;
}

.task-editor-feedback-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.55rem 1.25rem;
  color: $review-option-color;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
  background: $white;
  border: 1px solid $review-option-color;
  border-radius: 999px;
  cursor: pointer;
}

.task-editor-feedback-option:hover {
  background: rgba($review-option-color, 0.05);
}

.task-editor-feedback-option:focus-within {
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba($review-option-color, 0.18);
}

.task-editor-feedback-option-selected {
  color: $white;
  background: $review-option-color;
  border-color: $review-option-color;
}

.task-editor-feedback-option-selected:hover,
.task-editor-feedback-option-selected:focus-within {
  color: $white;
  background: $review-option-color;
  border-color: $review-option-color;
}

.task-editor-feedback-option > span {
  white-space: nowrap;
}

.task-editor-feedback-select {
  width: 100%;
}

.task-editor-feedback-hint,
.task-editor-submit-error {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
}

.task-editor-feedback-hint {
  color: $secondary;
}

.task-editor-submit-error {
  color: $danger-red;
}

.task-editor-action-status {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.6rem;
  margin: 0;
  padding: 0.85rem 0.9rem;
  color: $tdei-green;
  font-size: 0.92rem;
  line-height: 1.45;
  background: rgba($white, 0.92);
  border: 1px solid rgba($tdei-green, 0.24);
  border-radius: 0.85rem;
}

.task-editor-action-status :deep(.material-icons) {
  margin-top: 0;
}

.task-editor-action-status-blocked {
  color: $text-navy;
  background: $purple-background-medium;
  border-color: rgba($primary, 0.18);
}

.task-editor-action-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.task-editor-action-button {
  width: 100%;
  min-height: 3.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: 1rem;
  font-weight: 700;
  border-radius: 0.35rem;
}

.task-editor-action-button.btn-primary {
  color: $white;
  background: $primary;
  border-color: $primary;
}

.task-editor-action-button.btn-outline-secondary {
  color: $secondary;
  border-color: rgba($text-navy, 0.16);
  background: $white;
}

.task-editor-back {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: auto;
  padding: 0;
  font-weight: 700;
  color: $secondary;
  text-decoration: none;
  background: transparent;
  border: 0;
}

.task-editor-back:hover,
.task-editor-back:focus-visible {
  color: $primary;
}

@include media-breakpoint-down(lg) {
  .task-editor-shell {
    --task-editor-sidebar-width: min(28rem, 40vw);
    --task-editor-sidebar-rail-width: 3.5rem;
  }
}

@include media-breakpoint-down(sm) {
  .task-editor-page {
    padding: 0 !important;
  }

  .task-editor-shell {
    --task-editor-sidebar-width: min(25rem, calc(100vw - 3.25rem));
    --task-editor-sidebar-rail-width: 3.25rem;
  }

  .task-editor-title {
    font-size: 1.45rem;
  }

  .task-editor-sidebar-hero,
  .task-editor-tab-panel {
    padding-inline: 1rem;
  }

  .task-editor-tabs,
  .task-editor-sidebar-footer {
    padding-inline: 1rem;
  }

  .task-editor-task-summary {
    align-items: flex-start;
    flex-direction: column;
  }

  .task-editor-task-badges {
    justify-content: flex-start;
  }

  .task-editor-feedback-group {
    align-items: stretch;
    flex-direction: column;
  }

  .task-editor-feedback-legend {
    flex-basis: auto;
  }

  .task-editor-action-list {
    grid-template-columns: 1fr;
  }
}
</style>
