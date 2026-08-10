import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FeedbackPanel from '~/components/task-editor/FeedbackPanel.vue';

import type { WorkspaceProjectTaskFeedback } from '~/types/projects';

const feedback: WorkspaceProjectTaskFeedback[] = [{
  reasonCategory: 'incomplete_mapping',
  notes: 'Complete the missing crossings.',
  createdAt: new Date('2026-08-06T10:45:34.533Z'),
  createdByUserId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  createdByUserName: 'Ada Lovelace',
}];

describe('TaskEditorFeedbackPanel', () => {
  it('renders feedback details and author context', () => {
    const wrapper = mount(FeedbackPanel, {
      props: { feedback },
      global: { stubs: { AppIcon: true } },
    });

    expect(wrapper.get('h2').text()).toBe('Feedback (1)');
    expect(wrapper.get('.task-editor-feedback-heading p').text())
      .toBe('Feedback submitted for this task.');
    expect(wrapper.text()).toContain('Incomplete mapping');
    expect(wrapper.text()).toContain('Complete the missing crossings.');
    expect(wrapper.text()).toContain('Ada Lovelace');
    expect(wrapper.get('.task-editor-feedback-avatar').text()).toBe('AL');
    expect(wrapper.get('time').attributes('datetime')).toBe('2026-08-06T10:45:34.533Z');
  });

  it('renders an empty state when the API returns no feedback', () => {
    const wrapper = mount(FeedbackPanel, {
      props: { feedback: [] },
      global: { stubs: { AppIcon: true } },
    });

    expect(wrapper.text()).toContain('No feedback has been submitted for this task.');
    expect(wrapper.find('.task-editor-feedback-list').exists()).toBe(false);
  });
});
