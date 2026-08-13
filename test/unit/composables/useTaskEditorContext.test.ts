import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useTaskEditorContext } from '~/composables/useTaskEditorContext';
import type { WorkspaceProjectTaskApiStatus } from '~/types/projects';

describe('useTaskEditorContext', () => {
  it('derives mapper and validator presentation from the API task status', () => {
    const status = ref<WorkspaceProjectTaskApiStatus>('to_map');
    const context = useTaskEditorContext(status);

    expect(context.isReviewTask.value).toBe(false);
    expect(context.taskStatusLabel.value).toBe('TO MAP');

    status.value = 'to_remap';
    expect(context.taskStatusLabel.value).toBe('MORE MAPPING REQUIRED');

    status.value = 'to_review';
    expect(context.isReviewTask.value).toBe(true);
    expect(context.taskStatusLabel.value).toBe('TO REVIEW');
  });

  it('requires a reason and notes only when requesting a remap', () => {
    const context = useTaskEditorContext('to_review');

    expect(context.buildFeedbackPayload()).toBeUndefined();

    context.reviewDecision.value = 'remap';
    expect(context.reviewFeedbackIsIncomplete.value).toBe(true);
    expect(() => context.buildFeedbackPayload()).toThrow('Select a feedback reason');

    context.feedbackReasonCategory.value = 'incomplete_mapping';
    context.feedbackNotes.value = 'Map the missing buildings.';

    expect(context.reviewFeedbackIsIncomplete.value).toBe(false);
    expect(context.buildFeedbackPayload()).toEqual({
      notes: 'Map the missing buildings.',
      reasonCategory: 'incomplete_mapping',
    });
  });
});
