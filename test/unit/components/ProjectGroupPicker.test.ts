// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';

import ProjectGroupPicker from '~/components/ProjectGroupPicker.vue';

vi.mock('~/services/index', () => ({
  tdeiUserClient: {
    getMyProjectGroups: vi.fn()
  }
}));

const CURRENT_PROJECT_GROUP_ID = '33333333-3333-3333-3333-333333333333';

describe('ProjectGroupPicker', () => {
  it('shows the current option immediately without requiring interaction', async () => {
    sessionStorage.setItem('tdei-selected-project-group', JSON.stringify({
      id: CURRENT_PROJECT_GROUP_ID,
      name: 'Current Project Group'
    }));

    const wrapper = await mountSuspended(ProjectGroupPicker, {
      props: {
        id: 'project-group-picker',
        modelValue: CURRENT_PROJECT_GROUP_ID,
        options: [
          {
            tdei_project_group_id: '11111111-1111-1111-1111-111111111111',
            name: 'First Project Group'
          },
          {
            tdei_project_group_id: CURRENT_PROJECT_GROUP_ID,
            name: 'Current Project Group'
          }
        ],
        rememberSelection: true
      }
    });

    expect(wrapper.get('input').element.value).toBe('Current Project Group');
  });

  it('filters supplied project groups by name and selects the result', async () => {
    const wrapper = await mountSuspended(ProjectGroupPicker, {
      props: {
        id: 'project-group-picker',
        modelValue: CURRENT_PROJECT_GROUP_ID,
        options: [
          {
            tdei_project_group_id: '11111111-1111-1111-1111-111111111111',
            name: 'Puget Sound'
          },
          {
            tdei_project_group_id: '22222222-2222-2222-2222-222222222222',
            name: 'Eastside Trails'
          },
          {
            tdei_project_group_id: CURRENT_PROJECT_GROUP_ID,
            name: 'Current Project Group'
          }
        ]
      }
    });

    await wrapper.get('input').setValue('EASTSIDE');

    const results = wrapper.findAll('.list-group-item-action');
    expect(results).toHaveLength(1);
    expect(results[0]?.text()).toBe('Eastside Trails');

    await results[0]?.trigger('click');

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      '22222222-2222-2222-2222-222222222222'
    ]);
    expect(wrapper.get('input').element.value).toBe('Eastside Trails');
  });
});
