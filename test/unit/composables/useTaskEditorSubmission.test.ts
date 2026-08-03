import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useTaskEditorSubmission } from '~/composables/useTaskEditorSubmission';

const submitWorkspaceProjectTask = vi.hoisted(() => vi.fn());
const submitWorkspaceProjectTaskChangeset = vi.hoisted(() => vi.fn());
const unlockWorkspaceProjectTask = vi.hoisted(() => vi.fn());

vi.mock('~/services/index', () => ({
  workspaceProjectsClient: {
    submitWorkspaceProjectTask,
    submitWorkspaceProjectTaskChangeset,
    unlockWorkspaceProjectTask,
  },
}));

describe('useTaskEditorSubmission', () => {
  beforeEach(() => {
    submitWorkspaceProjectTask.mockReset();
    submitWorkspaceProjectTaskChangeset.mockReset();
    unlockWorkspaceProjectTask.mockReset();
  });

  it('submits mapper completion without validator feedback', async () => {
    submitWorkspaceProjectTask.mockResolvedValue(undefined);
    const onFinished = vi.fn().mockResolvedValue(undefined);
    const submission = useTaskEditorSubmission({
      buildFeedbackPayload: () => undefined,
      hasActiveEdits: ref(false),
      isReviewTask: ref(false),
      onFinished,
      pendingEditCount: ref(0),
      projectId: '39',
      reviewFeedbackIsIncomplete: ref(false),
      taskNumber: 2,
      workspaceId: 1763,
    });

    await submission.submitTask();

    expect(submitWorkspaceProjectTask).toHaveBeenCalledWith(1763, '39', 2, {
      done: true,
      feedback: undefined,
    });
    expect(onFinished).toHaveBeenCalledWith(false);
  });

  it('releases the lock when the user skips a task', async () => {
    unlockWorkspaceProjectTask.mockResolvedValue(undefined);
    const onFinished = vi.fn().mockResolvedValue(undefined);
    const submission = useTaskEditorSubmission({
      buildFeedbackPayload: () => undefined,
      hasActiveEdits: ref(false),
      isReviewTask: ref(true),
      onFinished,
      pendingEditCount: ref(0),
      projectId: '39',
      reviewFeedbackIsIncomplete: ref(false),
      taskNumber: 2,
      workspaceId: 1763,
    });

    await submission.releaseTask();

    expect(unlockWorkspaceProjectTask).toHaveBeenCalledWith(1763, '39', 2);
    expect(onFinished).toHaveBeenCalledWith(true);
  });

  it('uses a skip-specific fallback when releasing the lock fails', async () => {
    unlockWorkspaceProjectTask.mockRejectedValue(null);
    const onFinished = vi.fn().mockResolvedValue(undefined);
    const submission = useTaskEditorSubmission({
      buildFeedbackPayload: () => undefined,
      hasActiveEdits: ref(false),
      isReviewTask: ref(false),
      onFinished,
      pendingEditCount: ref(0),
      projectId: '39',
      reviewFeedbackIsIncomplete: ref(false),
      taskNumber: 2,
      workspaceId: 1763
    });

    await submission.releaseTask();

    expect(submission.submitErrorMessage.value)
      .toBe('Task could not be skipped. Please try again.');
    expect(onFinished).not.toHaveBeenCalled();
  });
});
