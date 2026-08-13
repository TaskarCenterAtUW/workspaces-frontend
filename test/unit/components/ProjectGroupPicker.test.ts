// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';

import ProjectGroupPicker from '~/components/ProjectGroupPicker.vue';

vi.mock('~/services/index', () => ({
  tdeiUserClient: {
    getMyProjectGroups: vi.fn(),
  },
}));

const CURRENT_PROJECT_GROUP_ID = '33333333-3333-3333-3333-333333333333';

describe('ProjectGroupPicker', () => {
  it('shows the current option immediately without requiring interaction', async () => {
    sessionStorage.setItem('tdei-selected-project-group', JSON.stringify({
      id: CURRENT_PROJECT_GROUP_ID,
      name: 'Current Project Group',
    }));

    const wrapper = await mountSuspended(ProjectGroupPicker, {
      props: {
        id: 'project-group-picker',
        modelValue: CURRENT_PROJECT_GROUP_ID,
        options: [
          {
            tdei_project_group_id: '11111111-1111-1111-1111-111111111111',
            name: 'First Project Group',
          },
          {
            tdei_project_group_id: CURRENT_PROJECT_GROUP_ID,
            name: 'Current Project Group',
          },
        ],
        rememberSelection: true,
      },
    });

    expect(wrapper.get('input').element.value).toBe('Current Project Group');
  });
});
