import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppIcon from '~/components/AppIcon.vue';
import WorkspaceImportStatusBadge from '~/components/dashboard/WorkspaceImportStatusBadge.vue';

import type { WorkspaceImportStatus } from '~/types/workspaces';

describe('WorkspaceImportStatusBadge', () => {
  it.each<[WorkspaceImportStatus | null, string, string]>([
    ['NA', 'Ready', 'md-edit_note'],
    ['failed', 'Setup failed. Select to view details', 'md-error_outline'],
    ['in-progress', 'Setting up…', 'md-hourglass_empty'],
    ['completed', 'Ready', 'md-check_circle_outline'],
    ['empty', 'Status unavailable', 'md-help_outline'],
    [null, 'Ready', 'md-edit_note']
  ])('renders %s as %s with its icon', (status, label, iconClass) => {
    const wrapper = mount(WorkspaceImportStatusBadge, {
      props: { status },
      global: {
        components: { AppIcon }
      }
    });

    expect(wrapper.find('.workspace-import-status-badge').text()).toContain(label);
    expect(wrapper.find('.material-icons').classes()).toContain(iconClass);
  });

  it('emits a click from an interactive failed status', async () => {
    const wrapper = mount(WorkspaceImportStatusBadge, {
      props: { status: 'failed', interactive: true },
      global: {
        components: { AppIcon }
      }
    });

    const badge = wrapper.find('.workspace-import-status-badge');
    expect(badge.element.tagName).toBe('BUTTON');
    await badge.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('does not make non-failed statuses interactive', () => {
    const wrapper = mount(WorkspaceImportStatusBadge, {
      props: { status: 'completed', interactive: true },
      global: {
        components: { AppIcon }
      }
    });

    const badge = wrapper.find('.workspace-import-status-badge');
    expect(badge.element.tagName).toBe('SPAN');
  });
});
