import type { MaybeRefOrGetter } from 'vue';
import type {
  WorkspaceProjectTaskApiStatus,
  WorkspaceProjectTaskFeedbackReasonCategory,
  WorkspaceProjectTaskSubmitFeedback,
} from '~/types/projects';

export type TaskReviewDecision = 'approve' | 'remap';

export interface TaskFeedbackReasonOption {
  label: string;
  value: WorkspaceProjectTaskFeedbackReasonCategory;
}

export const TASK_FEEDBACK_REASON_OPTIONS: TaskFeedbackReasonOption[] = [
  { label: 'Incomplete Mapping', value: 'incomplete_mapping' },
  { label: 'Data Quality Issue', value: 'data_quality_issue' },
  { label: 'Wrong Area', value: 'wrong_area' },
  { label: 'Other', value: 'other' },
];

export function useTaskEditorContext(
  apiStatus: MaybeRefOrGetter<WorkspaceProjectTaskApiStatus>,
) {
  const reviewDecision = ref<TaskReviewDecision>('approve');
  const feedbackNotes = ref('');
  const feedbackReasonCategory = ref<WorkspaceProjectTaskFeedbackReasonCategory | ''>('');

  const isReviewTask = computed(() => {
    const status = toValue(apiStatus);
    return status === 'to_review' || status === 'to_validate';
  });
  const isRemapTask = computed(() => {
    const status = toValue(apiStatus);
    return status === 'to_remap' || status === 'more_mapping_needed';
  });
  const taskStatusLabel = computed(() => {
    if (isReviewTask.value) {
      return 'TO REVIEW';
    }

    if (isRemapTask.value) {
      return 'MORE MAPPING REQUIRED';
    }

    const status = toValue(apiStatus);
    return status === 'completed' || status === 'done' ? 'COMPLETED' : 'TO MAP';
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
  const trimmedFeedbackNotes = computed(() => feedbackNotes.value.trim());
  const reviewFeedbackIsIncomplete = computed(() =>
    isReviewTask.value
    && reviewDecision.value === 'remap'
    && (!feedbackReasonCategory.value || !trimmedFeedbackNotes.value),
  );

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

  return {
    buildFeedbackPayload,
    feedbackNotes,
    feedbackReasonCategory,
    feedbackReasonOptions: TASK_FEEDBACK_REASON_OPTIONS,
    isRemapTask,
    isReviewTask,
    reviewDecision,
    reviewFeedbackIsIncomplete,
    taskStatusHelpText,
    taskStatusLabel,
  };
}
