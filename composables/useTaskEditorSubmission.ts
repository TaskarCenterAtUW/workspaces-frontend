import type { MaybeRefOrGetter } from 'vue';
import { resolveHttpErrorMessage } from '~/services/http';
import { workspaceProjectsClient } from '~/services/index';
import type { WorkspaceProjectTaskSubmitFeedback } from '~/types/projects';
import type { TaskEditorAction } from '~/types/task-editor';

interface UseTaskEditorSubmissionOptions {
  buildFeedbackPayload: () => WorkspaceProjectTaskSubmitFeedback | undefined;
  hasActiveEdits: MaybeRefOrGetter<boolean>;
  isReviewTask: MaybeRefOrGetter<boolean>;
  onFinished: (bypassUnsavedGuard: boolean) => Promise<void>;
  pendingEditCount: MaybeRefOrGetter<number>;
  projectId: string;
  reviewFeedbackIsIncomplete: MaybeRefOrGetter<boolean>;
  taskNumber: number;
  workspaceId: number;
}

export function useTaskEditorSubmission(options: UseTaskEditorSubmissionOptions) {
  const isSubmittingTask = ref(false);
  const isSubmittingChangeset = ref(false);
  const activeTaskAction = ref<'complete' | 'skip' | null>(null);
  const submitErrorMessage = ref('');
  const pendingChangesetId = ref<number | null>(null);
  const uploadedChangesetId = ref(-1);

  const completeTaskBlockedReason = computed(() => {
    if (isSubmittingTask.value) {
      return 'Task submission is in progress.';
    }

    if (isSubmittingChangeset.value && pendingChangesetId.value !== null) {
      return `Attaching uploaded changeset #${pendingChangesetId.value} to this task.`;
    }

    if (toValue(options.hasActiveEdits)) {
      const editCount = toValue(options.pendingEditCount);
      const editLabel = editCount === 1 ? 'edit' : 'edits';
      return `Push or discard your ${editCount} active ${editLabel} in Rapid before completing this task.`;
    }

    if (pendingChangesetId.value !== null) {
      return `Uploaded changeset #${pendingChangesetId.value} has not been attached to this task yet. Please upload again before completing.`;
    }

    if (toValue(options.reviewFeedbackIsIncomplete)) {
      return 'Select a reason and add notes before requesting a remap.';
    }

    return '';
  });
  const actions = computed<TaskEditorAction[]>(() => {
    const allActionsBusy = isSubmittingTask.value
      || isSubmittingChangeset.value
      || activeTaskAction.value !== null;
    const completeDisabled = allActionsBusy
      || toValue(options.hasActiveEdits)
      || pendingChangesetId.value !== null
      || toValue(options.reviewFeedbackIsIncomplete);
    const completeLabel = isSubmittingTask.value
      ? 'Submitting...'
      : toValue(options.isReviewTask)
        ? 'Submit Review'
        : 'I’m Done Mapping';

    return [
      {
        id: 'skip',
        label: activeTaskAction.value === 'skip' ? 'Skipping...' : 'Skip Task',
        variant: 'outline-secondary',
        disabled: allActionsBusy,
      },
      {
        id: 'complete',
        label: completeLabel,
        variant: 'primary',
        disabled: completeDisabled,
      },
    ];
  });
  const actionStatusMessage = computed(() => {
    if (completeTaskBlockedReason.value) {
      return completeTaskBlockedReason.value;
    }

    if (uploadedChangesetId.value > 0) {
      return `Last uploaded changeset #${uploadedChangesetId.value} will be attached when you complete this task.`;
    }

    return toValue(options.isReviewTask)
      ? 'Approve the mapping or request a remap with feedback.'
      : 'Push your edits in Rapid, then complete this task.';
  });
  const showActionStatus = computed(() =>
    Boolean(completeTaskBlockedReason.value) || uploadedChangesetId.value > 0,
  );

  async function submitTask() {
    submitErrorMessage.value = '';

    let feedback: WorkspaceProjectTaskSubmitFeedback | undefined;

    try {
      feedback = options.buildFeedbackPayload();
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
        options.workspaceId,
        options.projectId,
        options.taskNumber,
        {
          done: true,
          feedback,
        },
      );
      await options.onFinished(false);
    }
    catch (error) {
      submitErrorMessage.value = await resolveTaskSubmitErrorMessage(error);
    }
    finally {
      isSubmittingTask.value = false;
      activeTaskAction.value = null;
    }
  }

  const changesetAttachSequence = ref(0);

  async function attachUploadedChangeset(osmChangesetId: number) {
    const sequence = ++changesetAttachSequence.value;
    pendingChangesetId.value = osmChangesetId;
    isSubmittingChangeset.value = true;
    submitErrorMessage.value = '';

    try {
      await workspaceProjectsClient.submitWorkspaceProjectTaskChangeset(
        options.workspaceId,
        options.projectId,
        options.taskNumber,
        osmChangesetId,
      );
      if (sequence !== changesetAttachSequence.value) {
        return;
      }
      uploadedChangesetId.value = osmChangesetId;

      if (pendingChangesetId.value === osmChangesetId) {
        pendingChangesetId.value = null;
      }
    }
    catch {
      if (sequence !== changesetAttachSequence.value) {
        return;
      }
      submitErrorMessage.value = `Uploaded changeset #${osmChangesetId} could not be attached to this task. Please upload again before completing.`;
    }
    finally {
      if (sequence === changesetAttachSequence.value) {
        isSubmittingChangeset.value = false;
      }
    }
  }

  async function releaseTask() {
    submitErrorMessage.value = '';
    activeTaskAction.value = 'skip';

    try {
      await workspaceProjectsClient.unlockWorkspaceProjectTask(
        options.workspaceId,
        options.projectId,
        options.taskNumber,
      );
      await options.onFinished(true);
    }
    catch (error) {
      submitErrorMessage.value = await resolveTaskSubmitErrorMessage(
        error,
        'Task could not be skipped. Please try again.'
      );
    }
    finally {
      activeTaskAction.value = null;
    }
  }

  return {
    actions,
    actionStatusMessage,
    attachUploadedChangeset,
    completeTaskBlockedReason,
    releaseTask,
    showActionStatus,
    submitErrorMessage,
    submitTask,
  };
}

async function resolveTaskSubmitErrorMessage(
  error: unknown,
  fallbackMessage = 'Task submission failed.'
): Promise<string> {
  return await resolveHttpErrorMessage(error, fallbackMessage);
}
