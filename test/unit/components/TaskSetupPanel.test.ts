// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import TaskSetupPanel from '~/components/workspace-project-details/TaskSetupPanel.vue';
import type { ProjectWizardTaskGenerationSummary } from '~/types/project-wizard';

vi.mock('~/services/index', () => ({}));

const generatedSummary: ProjectWizardTaskGenerationSummary = {
  aoiSignature: '',
  approximateTaskAreaSquareKilometers: 0.45,
  generatedAt: '2026-11-19T00:00:00Z',
  requestedTaskAreaSquareKilometers: 0.45,
  taskGrid: { type: 'FeatureCollection', features: [] },
  totalTasks: 10
};

async function mountPanel(overrides: Record<string, unknown> = {}) {
  return await mountSuspended(TaskSetupPanel, {
    props: {
      activeSmallTaskIndex: null,
      canGenerate: true,
      canSave: true,
      discardSmallTasks: true,
      generatedSummary,
      generating: false,
      hasAoi: true,
      maximumTaskAreaSquareKilometers: 1,
      minimumTaskAreaSquareKilometers: 0.25,
      previewTaskCount: 10,
      projectName: 'Test',
      savedSummary: null,
      saving: false,
      smallTaskCount: 3,
      smallTaskThresholdSquareKilometers: 0.002,
      taskAreaSquareKilometers: 0.45,
      taskAreaStep: 0.05,
      taskCountToSave: 7,
      ...overrides
    }
  });
}

describe('TaskSetupPanel small tasks', () => {
  it('warns about small tasks with the threshold and the count after removal', async () => {
    const wrapper = await mountPanel();
    const warning = wrapper.find('[data-testid="small-task-warning"]');

    expect(warning.exists()).toBe(true);
    expect(warning.text()).toMatch(/3 tasks are smaller than (0\.002 km²|0\.00077 mi²)/);
    expect(wrapper.text()).toMatch(/created with 7 tasks/);
  });

  it('starts the map review with the first small task', async () => {
    const wrapper = await mountPanel();

    await wrapper.find('.project-task-setup-review-button').trigger('click');

    expect(wrapper.emitted('review-small-task')).toEqual([[0]]);
  });

  it('navigates individual tasks while keeping one collective choice', async () => {
    const wrapper = await mountPanel({ activeSmallTaskIndex: 1 });
    const navigation = wrapper.findAll('.project-task-setup-small-task-navigation-button');
    const [remove, keep] = wrapper.findAll('[data-testid="small-task-warning"] input[type="radio"]');

    expect((remove!.element as HTMLInputElement).checked).toBe(true);

    await keep!.trigger('change');
    await remove!.trigger('change');
    await navigation[0]!.trigger('click');
    await navigation[1]!.trigger('click');

    expect(wrapper.emitted('update:discard-small-tasks')).toEqual([[false], [true]]);
    expect(wrapper.emitted('review-small-task')).toEqual([[0], [2]]);
  });

  it('shows no warning when there are no small tasks', async () => {
    const wrapper = await mountPanel({ smallTaskCount: 0, taskCountToSave: 10 });

    expect(wrapper.find('[data-testid="small-task-warning"]').exists()).toBe(false);
  });
});
