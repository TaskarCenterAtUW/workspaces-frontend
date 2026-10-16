// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import PathwaysLevelPanel from '~/components/edit/PathwaysLevelPanel.vue';

import type { Level } from '~/services/pathways-levels';
import type { LevelStop, LevelStopGroup } from '~/services/rapid3-levels';

// The Nuxt env loads services/index, whose clients open IndexedDB caches on import.
vi.mock('~/services/index', () => ({}));

// Written to the @test unit outline in components/edit/PathwaysLevelPanel.vue,
// against a stub of Rapid3LevelTools (its reactive lists + action methods).

const street: Level = { levelId: 'L0', index: 0, name: 'Street', areaIds: ['a0'] };
const concourse: Level = { levelId: 'L1', index: -1, name: 'Concourse', areaIds: ['a1'] };
const platform: LevelStop = { id: 'n1', label: 'Platform: A', levelId: 'L0' };
const node: LevelStop = { id: 'n2', label: 'Node: n2', levelId: 'L1' };
const entrance: LevelStop = { id: 'n3', label: 'Entrance: Main', levelId: undefined };

function stubTools(currentLevelId?: string) {
  const showLevel = vi.fn((levelId: string | undefined) => {
    tools.currentLevelId.value = levelId;
  });
  const tools = {
    levels: shallowRef<Level[]>([concourse, street]),
    stopGroups: shallowRef<LevelStopGroup[]>([
      { level: concourse, stops: [node] },
      { level: street, stops: [platform] },
      { level: undefined, stops: [entrance] }
    ]),
    unleveled: shallowRef<LevelStop[]>([entrance]),
    levelAreasMissingId: shallowRef<LevelStop[]>([]),
    currentLevelId: ref<string | undefined>(currentLevelId),
    showLevel,
    zoomToLevel: vi.fn(),
    drawLevel: vi.fn(),
    select: vi.fn(),
    assignLevel: vi.fn(),
    connect: vi.fn(() => 'w-1')
  };
  return tools;
}

async function mountPanel(tools: ReturnType<typeof stubTools>) {
  return await mountSuspended(PathwaysLevelPanel, { props: { tools: tools as any } });
}

describe('PathwaysLevelPanel', () => {
  // @test unit: "Draw level" starts drawing a level outline on the map
  it('starts drawing a level from the Draw level button', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);

    const draw = wrapper.findAll('button').find(button => button.text() === 'Draw level')!;
    await draw.trigger('click');

    expect(tools.drawLevel).toHaveBeenCalled();
  });

  // @test unit: lists levels in level_index order, with an "All levels" option, and selecting one shows only that level
  it('lists levels in level_index order and shows the one picked', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);

    const options = wrapper.findAll('[role="radio"]');
    expect(options[0]!.text()).toBe('All levels');
    expect(options.slice(1).map(option => ['.level-index', '.level-name', '.badge']
      .map(selector => option.find(selector).text()))).toEqual([
      ['-1', 'Concourse (L1)', '1'],
      ['0', 'Street (L0)', '1']
    ]);
    expect(options[0]!.attributes('aria-checked')).toBe('true');

    await options[2]!.trigger('click');
    expect(tools.showLevel).toHaveBeenCalledWith('L0');
    expect(wrapper.findAll('[role="radio"]')[2]!.attributes('aria-checked')).toBe('true');

    await wrapper.findAll('[role="radio"]')[0]!.trigger('click');
    expect(tools.showLevel).toHaveBeenLastCalledWith(undefined);
  });

  // @test unit: lists stops with no level, and "Set level" assigns the selected level to them
  it('lists stops missing a level and assigns the shown level to them', async () => {
    const tools = stubTools('L0');
    const wrapper = await mountPanel(tools);

    expect(wrapper.text()).toContain('Missing level (1)');
    const issue = wrapper.find('.level-issue');
    expect(issue.text()).toContain('Entrance: Main');

    await issue.find('.level-issue-link').trigger('click');
    expect(tools.select).toHaveBeenCalledWith('n3');

    const setLevel = issue.findAll('button').find(button => button.text() === 'Set level')!;
    await setLevel.trigger('click');
    expect(tools.assignLevel).toHaveBeenCalledWith(['n3'], 'L0');
  });

  it('asks for a level before offering to assign one', async () => {
    const wrapper = await mountPanel(stubTools());

    expect(wrapper.find('.level-issue').findAll('button').map(button => button.text())).not.toContain('Set level');
    expect(wrapper.text()).toContain('Pick a level above to assign stops to it.');
  });

  // @test unit: connecting two stops creates a pathway of the chosen type; exit gates are always one-way
  it('connects the chosen stops with the chosen pathway type', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);

    const from = wrapper.find('#level-connect-from');
    expect(from.findAll('optgroup').map(group => group.attributes('label'))).toEqual([
      '-1 · Concourse (L1)',
      '0 · Street (L0)',
      'No level'
    ]);

    const add = wrapper.findAll('button').find(button => button.text() === 'Add connection')!;
    expect(add.attributes('disabled')).toBeDefined();

    await from.setValue('n1');
    await wrapper.find('#level-connect-to').setValue('n2');
    await wrapper.find('#level-connect-mode').setValue('5');
    await add.trigger('click');

    expect(tools.connect).toHaveBeenCalledWith('n1', 'n2', '5', true);
  });

  it('makes exit gates one-way', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);

    await wrapper.find('#level-connect-from').setValue('n1');
    await wrapper.find('#level-connect-to').setValue('n3');
    await wrapper.find('#level-connect-mode').setValue('7');

    const twoWay = wrapper.find('#level-connect-bidirectional');
    expect((twoWay.element as HTMLInputElement).checked).toBe(false);
    expect(twoWay.attributes('disabled')).toBeDefined();

    await wrapper.findAll('button').find(button => button.text() === 'Add connection')!.trigger('click');
    expect(tools.connect).toHaveBeenCalledWith('n1', 'n3', '7', false);
  });
});
