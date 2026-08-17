import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppIcon from '~/components/AppIcon.vue';
import WorkspaceImportStatusBadge from '~/components/dashboard/WorkspaceImportStatusBadge.vue';

import type { WorkspaceImportStatus } from '~/types/workspaces';

describe('WorkspaceImportStatusBadge', () => {
  it.each<[WorkspaceImportStatus | null, string, string]>([
    ['NA', 'Not applicable', 'md-remove_circle_outline'],
    ['failed', 'Failed', 'md-error_outline'],
    ['in-progress', 'In progress', 'md-hourglass_empty'],
    ['completed', 'Completed', 'md-check_circle_outline'],
    ['empty', 'Unknown', 'md-help_outline'],
    [null, 'Unknown', 'md-help_outline']
  ])('renders %s as %s with its icon', (status, label, iconClass) => {
    const wrapper = mount(WorkspaceImportStatusBadge, {
      props: { status },
      global: {
        components: { AppIcon }
      }
    });

    expect(wrapper.text()).toContain(label);
    expect(wrapper.find('.material-icons').classes()).toContain(iconClass);
  });

  it('emits a click from an interactive failed status', async () => {
    const wrapper = mount(WorkspaceImportStatusBadge, {
      props: { status: 'failed', interactive: true },
      global: {
        components: { AppIcon }
      }
    });

    expect(wrapper.element.tagName).toBe('BUTTON');
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('does not make non-failed statuses interactive', () => {
    const wrapper = mount(WorkspaceImportStatusBadge, {
      props: { status: 'completed', interactive: true },
      global: {
        components: { AppIcon }
      }
    });

    expect(wrapper.element.tagName).toBe('SPAN');
  });
});
