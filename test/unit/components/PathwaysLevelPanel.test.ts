// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import PathwaysLevelPanel from '~/components/edit/PathwaysLevelPanel.vue';

import { levelsTopDown } from '~/services/pathways-levels';
import type { Level, LevelView, StationLevelGroup } from '~/services/pathways-levels';
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
const roof: Level = { levelId: 'ROOF', index: undefined, name: '', areaIds: [] };

function stubTools(currentLevelId?: string) {
  const view = ref<LevelView | undefined>(currentLevelId ? { kind: 'level', levelId: currentLevelId } : undefined);
  const tools = {
    view,
    currentLevelId: computed(() => (view.value?.kind === 'level' ? view.value.levelId : undefined)),
    showView: vi.fn((next: LevelView | undefined) => {
      view.value = next;
    }),
    noStationStopCount: ref(0),
    visibleStationIds: shallowRef<Set<string> | undefined>(undefined),
    levels: shallowRef<Level[]>([concourse, street]),
    levelGroups: shallowRef<StationLevelGroup[]>([{ station: undefined, levels: [street, concourse] }]),
    stopGroups: shallowRef<LevelStopGroup[]>([
      { level: concourse, stops: [node] },
      { level: street, stops: [platform] },
      { level: undefined, stops: [entrance] }
    ]),
    unleveled: shallowRef<LevelStop[]>([entrance]),
    levelAreasMissingId: shallowRef<LevelStop[]>([]),
    zoomToLevel: vi.fn(),
    drawLevel: vi.fn(),
    fillLevelId: vi.fn(),
    select: vi.fn(),
    assignLevel: vi.fn(),
    reorderLevels: vi.fn(),
    outlineLevels: vi.fn()
  };
  return tools;
}

/** Sets the stub's levels, all in one unnamed group (no stations). */
function setLevels(tools: ReturnType<typeof stubTools>, levels: Level[]) {
  tools.levels.value = levels;
  tools.levelGroups.value = [{ station: undefined, levels: levelsTopDown(levels) }];
}

async function mountPanel(tools: ReturnType<typeof stubTools>) {
  return await mountSuspended(PathwaysLevelPanel, { props: { tools: tools as any } });
}

describe('PathwaysLevelPanel', () => {
  // @test unit: "Add level" starts drawing a new level's outline on the map
  it('starts drawing a new level from the Add level button', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);

    const draw = wrapper.findAll('button').find(button => button.text() === 'Add level')!;
    await draw.trigger('click');

    expect(tools.drawLevel).toHaveBeenCalled();
  });

  // @test unit: lists levels highest first, and selecting one shows only that level; selecting it again shows everything
  it('lists levels highest first and toggles showing the one picked', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);

    const options = wrapper.findAll('[role="radio"]');
    expect(options[0]!.text()).toBe('No station');
    expect(options.slice(1).map(option => ['.level-title', '.badge']
      .map(selector => option.find(selector).text()))).toEqual([
      ['Street (L0)', '1'],
      ['Concourse (L1)', '1']
    ]);
    // The order conveys the level; the index itself isn't shown.
    expect(options[1]!.find('.level-index').exists()).toBe(false);
    // Nothing is selected at first: everything is shown.
    expect(options.map(option => option.attributes('aria-checked'))).toEqual(['false', 'false', 'false']);

    await options[1]!.trigger('click');
    expect(tools.showView).toHaveBeenCalledWith({ kind: 'level', levelId: 'L0' });
    expect(wrapper.findAll('[role="radio"]')[1]!.attributes('aria-checked')).toBe('true');

    await wrapper.findAll('[role="radio"]')[1]!.trigger('click');
    expect(tools.showView).toHaveBeenLastCalledWith(undefined);
  });

  // @test unit: "No station" (at the top, over the levels no station uses) shows only features not tied to a station; it's hidden when there's nothing outside a station
  it('toggles the No station view', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);
    const noStation = () => wrapper.findAll('[role="radio"]').find(option => option.text() === 'No station')!;

    await noStation().trigger('click');
    expect(tools.showView).toHaveBeenLastCalledWith({ kind: 'noStation' });
    expect(noStation().attributes('aria-checked')).toBe('true');
    expect(noStation().attributes('title')).toContain('click again to show everything');

    await noStation().trigger('click');
    expect(tools.showView).toHaveBeenLastCalledWith(undefined);
  });

  it('hides No station when it has no levels and no stops outside a station', async () => {
    const tools = stubTools();
    tools.levelGroups.value = [{ station: undefined, levels: [] }];
    const wrapper = await mountPanel(tools);
    const hasNoStation = () => wrapper.findAll('[role="radio"]').some(option => option.text() === 'No station');

    expect(hasNoStation()).toBe(false);

    tools.noStationStopCount.value = 2; // loose stops: still worth a view
    await nextTick();
    expect(hasNoStation()).toBe(true);
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

  // @test unit: each level shows whether it has an outline; levels without one can have one drawn
  it('shows which levels have an outline and offers to draw the missing ones', async () => {
    const tools = stubTools();
    setLevels(tools, [concourse, street, roof]);
    const wrapper = await mountPanel(tools);

    const rows = wrapper.findAll('.level-row');
    expect(rows.map(row => row.find('.level-title').text())).toEqual(['Street (L0)', 'Concourse (L1)', 'ROOF']);
    const outlines = rows.map(row => row.find('.level-outline').text().replace(/\s+/g, ' '));
    expect(outlines.slice(0, 2)).toEqual(['Outline drawn', 'Outline drawn']);
    // (The pencil icon's ligature text, if rendered, sits between the two parts.)
    expect(outlines[2]).toMatch(/^No outline, (edit )?add one$/);
    // The draw link sits in the outline line, not inside the level's select button.
    expect(rows[2]!.find('[role="radio"] .level-draw').exists()).toBe(false);
    expect(rows[2]!.find('.level-outline .level-draw').attributes('aria-label')).toBe('Add an outline for ROOF');
    expect(rows.map(row => row.find('.level-draw').exists())).toEqual([false, false, true]);

    await rows[2]!.find('.level-draw').trigger('click');
    expect(tools.outlineLevels).toHaveBeenCalledWith(['ROOF']);
  });

  it('offers to outline all levels that have no outline', async () => {
    const tools = stubTools();
    const mez: Level = { levelId: 'MEZ', index: undefined, name: '', areaIds: [] };
    setLevels(tools, [concourse, street, roof]);
    let wrapper = await mountPanel(tools);
    expect(wrapper.text()).toContain('1 level has no outline yet');
    expect(wrapper.find('.level-outline-all').exists()).toBe(false); // "add one" covers a single level

    setLevels(tools, [concourse, street, roof, mez]);
    wrapper = await mountPanel(tools);
    expect(wrapper.text()).toContain('2 levels have no outline yet');
    await wrapper.find('.level-outline-all').trigger('click');
    expect(tools.outlineLevels).toHaveBeenCalledWith(['ROOF', 'MEZ']);
  });

  it('counts multiple outlines for one level', async () => {
    const tools = stubTools();
    setLevels(tools, [{ ...street, areaIds: ['a0', 'a9'] }]);
    const wrapper = await mountPanel(tools);

    expect(wrapper.find('.level-outline').text()).toBe('2 outlines');
  });

  // @test unit: level areas missing a level_id are flagged, and "Fill level_id" generates one
  it('flags level areas without a level_id and fills one in', async () => {
    const tools = stubTools();
    tools.levelAreasMissingId.value = [{ id: 'a2', label: 'Lower', levelId: undefined }];
    const wrapper = await mountPanel(tools);

    const issue = wrapper.findAll('.level-issue').find(item => item.text().includes('Level area Lower has no level_id'))!;
    await issue.findAll('button').find(button => button.text() === 'Fill level_id')!.trigger('click');

    expect(tools.fillLevelId).toHaveBeenCalledWith('a2');
  });

  // @test unit: levels with an outline can be reordered by dragging or with the arrow keys, which renumbers level_index
  describe('reordering', () => {
    const upper: Level = { levelId: 'UP', index: 1, name: 'Upper', areaIds: ['a2'] };

    async function mountThreeLevels() {
      const tools = stubTools();
      setLevels(tools, [concourse, street, upper, roof]);
      const wrapper = await mountPanel(tools);
      const row = (levelId: string) => wrapper.findAll('.level-row')
        .find(r => r.find('.level-title').text().includes(levelId))!;
      return { tools, wrapper, row };
    }

    it('only lets levels with an outline move', async () => {
      const { wrapper, row } = await mountThreeLevels();

      expect(wrapper.findAll('.level-row').map(r => r.attributes('draggable'))).toEqual(['true', 'true', 'true', 'false']);
      expect(row('UP').find('button.level-handle').attributes('aria-disabled')).toBeUndefined();
    });

    // @test unit: levels without an outline show a disabled handle saying to add an outline first
    it('shows a disabled handle on levels without an outline', async () => {
      const { tools, row } = await mountThreeLevels();

      const handle = row('ROOF').find('button.level-handle');
      expect(handle.attributes('aria-disabled')).toBe('true');
      expect(handle.attributes('title')).toBe('Add an outline to ROOF before moving it');

      await handle.trigger('keydown', { key: 'ArrowUp' });
      await handle.trigger('keydown', { key: 'ArrowDown' });
      expect(tools.reorderLevels).not.toHaveBeenCalled();
    });

    it('moves a level down with the arrow keys and keeps focus on it', async () => {
      const { tools, row } = await mountThreeLevels();

      await row('UP').find('button.level-handle').trigger('keydown', { key: 'ArrowDown' });

      expect(tools.reorderLevels).toHaveBeenCalledWith(['L0', 'UP', 'L1']);
    });

    it('does nothing when moving past the top', async () => {
      const { tools, row } = await mountThreeLevels();

      await row('UP').find('button.level-handle').trigger('keydown', { key: 'ArrowUp' });

      expect(tools.reorderLevels).not.toHaveBeenCalled();
    });

    it('drops a dragged level above or below the row it lands on', async () => {
      const { tools, row } = await mountThreeLevels();
      const rect = { top: 100, height: 40 } as DOMRect;
      for (const r of ['UP', 'L0', 'L1']) {
        (row(r).element as HTMLElement).getBoundingClientRect = () => rect;
      }

      // Drag UP onto the lower half of the concourse row -> below it.
      await row('UP').trigger('dragstart', { dataTransfer: { setData: vi.fn() } });
      await row('L1').trigger('dragover', { clientY: 130, dataTransfer: {} });
      expect(row('L1').classes()).toContain('level-drop-after');
      await row('L1').trigger('drop');
      expect(tools.reorderLevels).toHaveBeenLastCalledWith(['L0', 'L1', 'UP']);

      // Drag the concourse onto the upper half of the top row -> to the top.
      await row('L1').trigger('dragstart', { dataTransfer: { setData: vi.fn() } });
      await row('UP').trigger('dragover', { clientY: 105, dataTransfer: {} });
      await row('UP').trigger('drop');
      expect(tools.reorderLevels).toHaveBeenLastCalledWith(['L1', 'UP', 'L0']);
    });

    it('treats dropping on a level without an outline as moving to the bottom', async () => {
      const { tools, row } = await mountThreeLevels();

      await row('UP').trigger('dragstart', { dataTransfer: { setData: vi.fn() } });
      await row('ROOF').trigger('dragover', { clientY: 0, dataTransfer: {} });
      await row('ROOF').trigger('drop');

      expect(tools.reorderLevels).toHaveBeenCalledWith(['L0', 'L1', 'UP']);
    });
  });

  // @test unit: with more than one station, levels are grouped under the stations whose stops use them
  describe('stations', () => {
    const central = { id: 's1', stopId: 'CENTRAL', name: 'Central' };
    const annex = { id: 's2', stopId: 'ANNEX', name: 'Annex' };
    const upper: Level = { levelId: 'UP', index: 1, name: 'Upper', areaIds: ['a2'] };

    async function mountStations() {
      const tools = stubTools();
      tools.levels.value = [concourse, street, upper];
      tools.levelGroups.value = [
        { station: undefined, levels: [] },
        { station: annex, levels: [street] },
        { station: central, levels: [upper, street, concourse] }
      ];
      return { tools, wrapper: await mountPanel(tools) };
    }

    it('lists each station\'s levels under its name, repeating shared levels', async () => {
      const { wrapper } = await mountStations();

      const groups = wrapper.findAll('[role="group"]');
      expect(groups.map(group => group.attributes('aria-label'))).toEqual(['Annex', 'Central']);
      expect(groups.map(group => group.findAll('.level-title').map(title => title.text()))).toEqual([
        ['Street (L0)'],
        ['Upper (UP)', 'Street (L0)', 'Concourse (L1)']
      ]);
      expect(wrapper.findAll('.level-group-heading').map(heading => heading.text())).toEqual(['Annex', 'Central']);
    });

    it('highlights a shared level under every station when it is shown', async () => {
      const { tools, wrapper } = await mountStations();

      tools.view.value = { kind: 'level', levelId: 'L0' };
      await nextTick();

      const active = wrapper.findAll('.level-row.active .level-title').map(title => title.text());
      expect(active).toEqual(['Street (L0)', 'Street (L0)']);
    });

    it('reorders only within a station', async () => {
      const { tools, wrapper } = await mountStations();
      const central = wrapper.findAll('[role="group"]')[1]!;
      const rows = central.findAll('.level-row');

      await rows[0]!.find('button.level-handle').trigger('keydown', { key: 'ArrowDown' });
      expect(tools.reorderLevels).toHaveBeenCalledWith(['L0', 'UP', 'L1']);

      // Dragging a Central level over Annex's group isn't a drop target.
      const annexRow = wrapper.findAll('[role="group"]')[0]!.find('.level-row');
      await rows[0]!.trigger('dragstart', { dataTransfer: { setData: vi.fn() } });
      await annexRow.trigger('dragover', { clientY: 0, dataTransfer: {} });
      expect(annexRow.classes()).not.toContain('level-drop-before');
      expect(annexRow.classes()).not.toContain('level-drop-after');
      await annexRow.trigger('drop');
      expect(tools.reorderLevels).toHaveBeenCalledTimes(1);
    });

    // @test unit: only stations with features in the map view are listed (plus the one being viewed)
    it('lists only stations in the map view, keeping the one being viewed', async () => {
      const { tools, wrapper } = await mountStations();
      const listed = () => wrapper.findAll('.level-station-link').map(link => link.text());
      const hint = () => wrapper.findAll('.level-panel-hint').map(p => p.text()).find(text => text.includes('out of view'));

      expect(listed()).toEqual(['Annex', 'Central']); // view not known yet: all
      expect(hint()).toBeUndefined();

      tools.visibleStationIds.value = new Set(['CENTRAL']);
      await nextTick();
      expect(listed()).toEqual(['Central']);
      expect(hint()).toBe('1 station is out of view; pan or zoom the map to list it.');

      // Annex stays listed while its Street / No level view is shown...
      tools.view.value = { kind: 'stationNoLevel', stationId: 'ANNEX' };
      await nextTick();
      expect(listed()).toEqual(['Annex', 'Central']);

      // ...or while one of its levels is.
      tools.view.value = { kind: 'level', levelId: 'L0' };
      tools.visibleStationIds.value = new Set();
      await nextTick();
      expect(listed()).toEqual(['Annex', 'Central']); // both use the shared street level
    });

    // @test unit: clicking a station's name selects the station in the editor
    it('selects the station when its name is clicked', async () => {
      const { tools, wrapper } = await mountStations();

      const central = wrapper.findAll('.level-station-link').find(link => link.text() === 'Central')!;
      expect(central.attributes('title')).toBe('Select Central (stop_id CENTRAL) to see or edit it');
      await central.trigger('click');

      expect(tools.select).toHaveBeenCalledWith('s1');
    });

    // @test unit: each station starts with "Street / No level", which shows that station's features that have no level
    it('starts each station with a Street / No level entry for its unleveled features', async () => {
      const { tools, wrapper } = await mountStations();
      const stationRadios = (i: number) => wrapper.findAll('[role="group"]')[i]!.findAll('[role="radio"]');

      // First under each station, above its levels.
      expect([0, 1].map(i => stationRadios(i).map(option => option.text().replace(/\s+/g, ' ')))).toEqual([
        ['Street / No level', expect.stringContaining('Street (L0)')],
        ['Street / No level', expect.stringContaining('Upper (UP)'), expect.stringContaining('Street (L0)'),
          expect.stringContaining('Concourse (L1)')]
      ]);

      const centralNoLevel = stationRadios(1)[0]!;
      expect(centralNoLevel.attributes('title')).toContain('Central\'s features that have no level');
      await centralNoLevel.trigger('click');
      expect(tools.showView).toHaveBeenLastCalledWith({ kind: 'stationNoLevel', stationId: 'CENTRAL' });
      expect(centralNoLevel.attributes('aria-checked')).toBe('true');
      // Annex's entry isn't selected by Central's.
      expect(stationRadios(0)[0]!.attributes('aria-checked')).toBe('false');
    });

    it('shows no headings with a single group', async () => {
      const wrapper = await mountPanel(stubTools());

      expect(wrapper.find('.level-group-heading').exists()).toBe(false);
      expect(wrapper.find('[role="group"]').exists()).toBe(false);
    });
  });
});
