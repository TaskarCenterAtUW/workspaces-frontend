// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import PathwaysLevelPanel from '~/components/edit/PathwaysLevelPanel.vue';

import { levelsLowestFirst } from '~/services/pathways-levels';
import type { Level, LevelView, StationLevelGroup } from '~/services/pathways-levels';
import type { FixmeNote, LargeLevelArea, LevelStop, LevelStopGroup, ReferenceDrawingStatus, ReferenceLegendEntry } from '~/services/rapid3-levels';

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
    workspaceLoad: ref<'loading' | 'loaded' | 'failed' | undefined>(),
    retryWorkspaceLoad: vi.fn(),
    visibleStationIds: shallowRef<Set<string> | undefined>(undefined),
    levels: shallowRef<Level[]>([concourse, street]),
    levelGroups: shallowRef<StationLevelGroup[]>([{ station: undefined, levels: [street, concourse] }]),
    levelPathways: shallowRef(new Map<string, { id: string; stationIds: string[] }[]>()),
    stopGroups: shallowRef<LevelStopGroup[]>([
      { level: concourse, stops: [node] },
      { level: street, stops: [platform] },
      { level: undefined, stops: [entrance] }
    ]),
    unleveled: shallowRef<LevelStop[]>([entrance]),
    levelAreasMissingId: shallowRef<LevelStop[]>([]),
    largeLevelAreas: shallowRef<LargeLevelArea[]>([]),
    farStops: shallowRef<(LevelStop & { meters: number })[]>([]),
    fixmes: shallowRef<FixmeNote[]>([]),
    referenceDrawing: ref<{ levelId: string; status: ReferenceDrawingStatus; legend?: ReferenceLegendEntry[] } | undefined>(),
    showReferenceDrawings: ref(true),
    toggleReferenceDrawings: vi.fn(),
    updateReferenceDrawing: vi.fn(),
    zoomToLevel: vi.fn(),
    zoomToStation: vi.fn(),
    drawLevel: vi.fn(),
    fillLevelId: vi.fn(),
    select: vi.fn(),
    highlight: vi.fn(),
    assignLevel: vi.fn(),
    reorderLevels: vi.fn(),
    outlineLevels: vi.fn(),
    refitLevelArea: vi.fn(),
    selectLevelOutline: vi.fn()
  };
  return tools;
}

/** Sets the stub's levels, all in one unnamed group (no stations). */
function setLevels(tools: ReturnType<typeof stubTools>, levels: Level[]) {
  tools.levels.value = levels;
  tools.levelGroups.value = [{ station: undefined, levels: levelsLowestFirst(levels) }];
}

async function mountPanel(tools: ReturnType<typeof stubTools>) {
  return await mountSuspended(PathwaysLevelPanel, { props: { tools: tools as any } });
}

describe('PathwaysLevelPanel', () => {
  // @test unit: a "Things to review (N)" section lists every feature with a fixme note (its label and the note), and is hidden when there are none (and no reference drawing); "Hide"/"Show" collapses the list
  it('lists features with a fixme note, hidden when there are none, and collapsible', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);
    expect(wrapper.find('.fixme-section').exists()).toBe(false);

    tools.fixmes.value = [
      { id: 'n1', label: 'Platform: A', note: 'set stop_id to the agency\'s platform', stationIds: [] },
      { id: 'w7', label: 'Stairs: A ↔ B', note: 'which way does it go?', stationIds: [] }
    ];
    await nextTick();
    const section = wrapper.find('.fixme-section');
    expect(section.find('h2').text()).toBe('Things to review (2)');
    expect(section.findAll('.fixme-item').map(item => [item.find('.fixme-label').text(), item.find('.fixme-note').text()]))
      .toEqual([['Platform: A', 'set stop_id to the agency\'s platform'], ['Stairs: A ↔ B', 'which way does it go?']]);

    const toggle = section.find('.level-panel-header button');
    expect(toggle.text()).toBe('Hide');
    await toggle.trigger('click');
    expect(section.find('.fixme-list').exists()).toBe(false);
    expect(toggle.text()).toBe('Show');
    await toggle.trigger('click');
    expect(section.findAll('.fixme-item')).toHaveLength(2);
  });

  // @test unit: while a level with a reference drawing is shown, "Things to review" has a checkbox to show or hide it, notes while it's loading or if it couldn't load (with "Retry"), and shows a legend of the roles it draws, each with its color; the section appears for a drawing even with no fixme notes
  it('puts the shown level\'s reference drawing under Things to review: a checkbox, its status and a legend', async () => {
    const tools = stubTools('L0');
    const wrapper = await mountPanel(tools);
    const section = () => wrapper.find('.fixme-section');
    expect(section().exists()).toBe(false); // no fixme notes, no drawing

    tools.referenceDrawing.value = { levelId: 'L0', status: 'loading' };
    await nextTick();
    expect(section().find('h2').text()).toBe('Things to review'); // shown for the drawing alone
    const checkbox = section().find<HTMLInputElement>('#show-reference-drawing');
    expect(checkbox.element.checked).toBe(true);
    expect(section().find('.reference-drawing-hint').text()).toBe('Loading the reference drawing\u2026');

    tools.referenceDrawing.value = { levelId: 'L0', status: 'shown', legend: [{ label: 'Walls', color: '#e040fb' }, { label: 'Stairs', color: '#ff6d00' }] };
    await nextTick();
    expect(section().find('.reference-drawing-hint').exists()).toBe(false);
    const entries = section().findAll('.reference-legend li');
    expect(entries.map(entry => entry.text())).toEqual(['Walls', 'Stairs']);
    expect(entries[0]!.find('.reference-legend-swatch').attributes('style')).toContain('#e040fb');

    await checkbox.setValue(false);
    expect(tools.toggleReferenceDrawings).toHaveBeenCalledTimes(1);
    tools.showReferenceDrawings.value = false;
    tools.referenceDrawing.value = { levelId: 'L0', status: 'hidden' };
    await nextTick();
    expect(checkbox.element.checked).toBe(false);
    expect(section().find('.reference-legend').exists()).toBe(false);

    tools.referenceDrawing.value = { levelId: 'L0', status: 'failed' };
    await nextTick();
    const hint = section().find('.reference-drawing-hint');
    expect(hint.attributes('role')).toBe('alert');
    expect(hint.text().replace(/\s+/g, ' ')).toBe('Couldn\'t load the reference drawing. Retry');
    await hint.find('button').trigger('click');
    expect(tools.updateReferenceDrawing).toHaveBeenCalledTimes(1);
  });

  // @test unit: clicking a fixme entry selects its feature, and pointing at or focusing one highlights it on the map
  it('selects a fixme entry\'s feature when clicked, and highlights it while pointed at or focused', async () => {
    const tools = stubTools();
    tools.fixmes.value = [{ id: 'w7', label: 'Stairs: A ↔ B', note: 'which way does it go?', stationIds: [] }];
    const wrapper = await mountPanel(tools);
    const item = wrapper.find('.fixme-item');

    await item.trigger('mouseenter');
    expect(tools.highlight).toHaveBeenLastCalledWith(['w7'], true);
    await item.trigger('mouseleave');
    expect(tools.highlight).toHaveBeenLastCalledWith(['w7'], false);
    await item.trigger('focus');
    expect(tools.highlight).toHaveBeenLastCalledWith(['w7'], true);
    await item.trigger('click');
    expect(tools.select).toHaveBeenCalledWith('w7');
  });

  // @test unit: each level shows its name, node count and edge (pathway) count; "Outline all" by the heading boxes every level that has no outline (level problems are Rapid issues, see services/rapid3-validation.ts)
  it('offers "Outline all" by the heading while levels have no outline, and no warnings box', async () => {
    const tools = stubTools();
    const mez: Level = { levelId: 'MEZ', index: undefined, name: '', areaIds: [] };
    setLevels(tools, [concourse, street]);
    const wrapper = await mountPanel(tools);
    const outlineAll = () => wrapper.findAll('.level-panel-header button').find(b => b.text().startsWith('Outline all'));
    expect(outlineAll()).toBeUndefined();
    expect(wrapper.text()).not.toContain('Warnings');

    setLevels(tools, [concourse, street, roof, mez]);
    await nextTick();
    expect(outlineAll()!.text()).toBe('Outline all (2)');
    await outlineAll()!.trigger('click');
    expect(tools.outlineLevels).toHaveBeenCalledWith(['ROOF', 'MEZ']);
  });

  // @test unit: an outline much bigger than its stops need has its level's "Refit" highlighted
  it('highlights Refit on a level whose outline is much bigger than its stops need', async () => {
    const tools = stubTools();
    setLevels(tools, [concourse, street]);
    tools.largeLevelAreas.value = [
      { id: 'a1', label: 'Concourse (L1)', levelId: 'L1', meters: 340, stopsMeters: 31, oversized: true },
      { id: 'a0', label: 'Street (L0)', levelId: 'L0', meters: 612, stopsMeters: 577, oversized: false }
    ];
    const wrapper = await mountPanel(tools);

    const row = (levelId: string) => wrapper.findAll('.level-row').find(r => r.find('.level-title').text().includes(levelId))!;
    expect(row('L1').find('.level-refit').classes()).toContain('level-refit-needed');
    expect(row('L0').find('.level-refit').classes()).not.toContain('level-refit-needed');
  });

  // @test unit: lists levels highest first (positive level_index, 0, then negative), each showing its level_index, and selecting one shows only that level; selecting it again shows everything
  it('lists levels highest first with their indexes, and toggles showing the one picked', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);

    const options = wrapper.findAll('[role="radio"]');
    expect(options[0]!.text()).toBe('No station');
    expect(options.slice(1).map(option => ['.level-title', '.badge']
      .map(selector => option.find(selector).text()))).toEqual([
      ['Street (L0)', '1 node'],
      ['Concourse (L1)', '1 node']
    ]);
    expect(options.slice(1).map(option => option.find('.level-index').text())).toEqual(['0', '-1']);
    // Nothing is selected at first: everything is shown.
    expect(options.map(option => option.attributes('aria-checked'))).toEqual(['false', 'false', 'false']);

    await options[1]!.trigger('click');
    expect(tools.showView).toHaveBeenCalledWith({ kind: 'level', levelId: 'L0' });
    expect(tools.selectLevelOutline).toHaveBeenCalledWith('L0'); // opens its outline in the sidebar
    expect(wrapper.findAll('[role="radio"]')[1]!.attributes('aria-checked')).toBe('true');

    await wrapper.findAll('[role="radio"]')[1]!.trigger('click');
    expect(tools.showView).toHaveBeenLastCalledWith(undefined);
    expect(tools.selectLevelOutline).toHaveBeenLastCalledWith(undefined);
  });

  // @test unit: "No station" (at the top, over the levels no station uses) shows only features not tied to a station; it's hidden when there's nothing outside a station
  it('toggles the No station view', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);
    const noStation = () => wrapper.findAll('[role="radio"]').find(option => option.text() === 'No station')!;

    await noStation().trigger('click');
    expect(tools.showView).toHaveBeenLastCalledWith({ kind: 'noStation' });
    expect(tools.selectLevelOutline).not.toHaveBeenCalled(); // not a level
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

  // @test unit: while the whole workspace is loading, a note says levels may show under "No station"; if it fails, a note offers "Retry"
  it('says when the whole workspace is still loading, or failed to', async () => {
    const tools = stubTools();
    const wrapper = await mountPanel(tools);
    const note = () => wrapper.findAll('.level-panel-hint').find(p => p.text().includes('whole workspace'));
    expect(note()).toBeUndefined();

    tools.workspaceLoad.value = 'loading';
    await nextTick();
    expect(note()!.text()).toContain('Loading the whole workspace');
    expect(note()!.attributes('role')).toBe('status');

    tools.workspaceLoad.value = 'failed';
    await nextTick();
    expect(note()!.text()).toContain('Couldn\'t load the whole workspace');
    await note()!.find('button').trigger('click');
    expect(tools.retryWorkspaceLoad).toHaveBeenCalled();

    tools.workspaceLoad.value = 'loaded';
    await nextTick();
    expect(note()).toBeUndefined();
  });

  // @test unit: each level shows its name, node count and edge (pathway) count; a warning at the top counts levels without an outline, with "Outline all" to box every one
  it('shows each level\'s name and node count, with levels without an outline last', async () => {
    const tools = stubTools();
    setLevels(tools, [concourse, street, roof]);
    tools.stopGroups.value = [
      { level: street, stops: [] },
      { level: concourse, stops: [{ id: 'n2', label: 'Node', levelId: 'L1' }, { id: 'n4', label: 'Node', levelId: 'L1' }] }
    ];
    const wrapper = await mountPanel(tools);

    const rows = wrapper.findAll('.level-row');
    expect(rows.map(row => [row.find('.level-title').text(), row.find('.badge').text()])).toEqual([
      ['Street (L0)', '0 nodes'],
      ['Concourse (L1)', '2 nodes'],
      ['ROOF', '0 nodes']
    ]);
  });

  // @test unit: every level row has "Refit", which reshapes its outline into a box around its stops; disabled (saying why) without one outline and some stops
  it('offers Refit on every level, disabled when there\'s nothing to refit', async () => {
    const tools = stubTools();
    const twoOutlines: Level = { levelId: 'L2', index: 2, name: '', areaIds: ['a2', 'a3'] };
    const empty: Level = { levelId: 'L3', index: 3, name: '', areaIds: ['a4'] };
    setLevels(tools, [concourse, street, twoOutlines, empty, roof]);
    tools.stopGroups.value = [
      { level: concourse, stops: [node] },
      { level: street, stops: [platform] },
      { level: twoOutlines, stops: [{ id: 'n7', label: 'Node: n7', levelId: 'L2' }] },
      { level: roof, stops: [{ id: 'n8', label: 'Node: n8', levelId: 'ROOF' }] }
    ];
    const wrapper = await mountPanel(tools);

    const refit = (levelId: string) => wrapper.findAll('.level-row')
      .find(r => r.find('.level-title').text().includes(levelId))!.find('.level-refit');
    expect(['L1', 'L0', 'L2', 'L3', 'ROOF'].map(id => refit(id).attributes('disabled') !== undefined))
      .toEqual([false, false, true, true, true]);
    expect(refit('L2').attributes('title')).toBe('L2 has 2 outlines; refitting would stack them into one box');
    expect(refit('L3').attributes('title')).toBe('L3 has no stops to fit its outline to');
    expect(refit('ROOF').attributes('title')).toBe('ROOF has no outline to refit yet');
    expect(refit('L0').attributes('title')).toBe('Reshape Street (L0)\'s outline into a box around its stops');

    await refit('L0').trigger('click');
    expect(tools.refitLevelArea).toHaveBeenCalledWith('a0');
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

    it('orders positive indexes, then 0, then negative, with levels without an index last', async () => {
      const { wrapper } = await mountThreeLevels();

      expect(wrapper.findAll('.level-row').map(r => [r.find('.level-index').text(), r.find('.level-title').text()])).toEqual([
        ['1', 'Upper (UP)'],
        ['0', 'Street (L0)'],
        ['-1', 'Concourse (L1)'],
        ['–', 'ROOF']
      ]);
    });

    // @test unit: a row doesn't repeat a level_id that equals its level_index, or a level_name that equals its level_id
    it('doesn\'t repeat a level_id equal to the level_index, or a name equal to the level_id', async () => {
      const tools = stubTools();
      setLevels(tools, [
        { levelId: '2', index: 2, name: '', areaIds: ['a2'] },
        { levelId: '1.0', index: 1, name: 'Mezzanine', areaIds: ['a1'] },
        { levelId: 'B', index: 0, name: 'B', areaIds: ['a0'] },
        { levelId: '-1', index: -2, name: '', areaIds: ['a3'] }
      ]);
      const wrapper = await mountPanel(tools);

      expect(wrapper.findAll('.level-row').map(r => [r.find('.level-index').text(), r.find('.level-title').exists() ? r.find('.level-title').text() : null]))
        .toEqual([['2', null], ['1', 'Mezzanine'], ['0', 'B'], ['-2', '-1']]);
      // Tooltips and labels still name the level in full.
      expect(wrapper.findAll('.level-row')[0]!.find('button.level-handle').attributes('aria-label')).toContain('Move 2');
    });

    // @test unit: levels missing an outline or a level_index are flagged as errors on their rows, which sit below the numbered levels
    it('flags levels missing an outline or a level_index, below the numbered ones', async () => {
      const tools = stubTools();
      const noIndex: Level = { levelId: 'MZ', index: undefined, name: 'Mezzanine', areaIds: ['a9'] };
      setLevels(tools, [roof, noIndex, street]);
      const wrapper = await mountPanel(tools);

      expect(wrapper.findAll('.level-row').map(r => [
        r.find('.level-title').text(),
        r.find('.level-error').exists() ? r.find('.level-error').attributes('aria-label') : undefined
      ])).toEqual([
        ['Street (L0)', undefined],
        ['Mezzanine (MZ)', 'Mezzanine (MZ) needs a level_index'],
        ['ROOF', 'ROOF has no outline, so it won\'t be in levels.txt']
      ]);
    });

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

      // Now listed L0, UP, L1, which is L1, UP, L0 from the lowest up.
      expect(tools.reorderLevels).toHaveBeenCalledWith(['L1', 'UP', 'L0']);
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

      // Drag UP onto the lower half of the street row -> below it, so one floor lower.
      await row('UP').trigger('dragstart', { dataTransfer: { setData: vi.fn() } });
      await row('L0').trigger('dragover', { clientY: 130, dataTransfer: {} });
      expect(row('L0').classes()).toContain('level-drop-after');
      await row('L0').trigger('drop');
      expect(tools.reorderLevels).toHaveBeenLastCalledWith(['L1', 'UP', 'L0']);

      // Drag the concourse onto the upper half of the top row -> to the top.
      await row('L1').trigger('dragstart', { dataTransfer: { setData: vi.fn() } });
      await row('UP').trigger('dragover', { clientY: 105, dataTransfer: {} });
      await row('UP').trigger('drop');
      expect(tools.reorderLevels).toHaveBeenLastCalledWith(['L0', 'UP', 'L1']);
    });

    it('treats dropping on a level without an outline as moving to the bottom', async () => {
      const { tools, row } = await mountThreeLevels();

      await row('UP').trigger('dragstart', { dataTransfer: { setData: vi.fn() } });
      await row('ROOF').trigger('dragover', { clientY: 0, dataTransfer: {} });
      await row('ROOF').trigger('drop');

      expect(tools.reorderLevels).toHaveBeenCalledWith(['UP', 'L1', 'L0']);
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
      expect(tools.reorderLevels).toHaveBeenCalledWith(['L1', 'UP', 'L0']);

      // Dragging a Central level over Annex's group isn't a drop target.
      const annexRow = wrapper.findAll('[role="group"]')[0]!.find('.level-row');
      await rows[0]!.trigger('dragstart', { dataTransfer: { setData: vi.fn() } });
      await annexRow.trigger('dragover', { clientY: 0, dataTransfer: {} });
      expect(annexRow.classes()).not.toContain('level-drop-before');
      expect(annexRow.classes()).not.toContain('level-drop-after');
      await annexRow.trigger('drop');
      expect(tools.reorderLevels).toHaveBeenCalledTimes(1);
    });

    // @test unit: only stations with features in the map view are listed, even the one being viewed
    it('lists only stations in the map view, even the one being viewed', async () => {
      const { tools, wrapper } = await mountStations();
      const listed = () => wrapper.findAll('.level-station-link').map(link => link.text());
      const hint = () => wrapper.findAll('.level-panel-hint').map(p => p.text()).find(text => text.includes('out of view'));

      expect(listed()).toEqual(['Annex', 'Central']); // view not known yet: all
      expect(hint()).toBeUndefined();

      tools.visibleStationIds.value = new Set(['CENTRAL']);
      await nextTick();
      expect(listed()).toEqual(['Central']);
      expect(hint()).toBe('1 station is out of view; pan or zoom the map to list it.');

      // Annex stays out while its No level view is shown...
      tools.view.value = { kind: 'stationNoLevel', stationId: 'ANNEX' };
      await nextTick();
      expect(listed()).toEqual(['Central']);

      // ...or one of its levels is, once it's scrolled out of view.
      tools.view.value = { kind: 'level', levelId: 'L0' };
      tools.visibleStationIds.value = new Set();
      await nextTick();
      expect(listed()).toEqual([]);
      expect(hint()).toBe('2 stations are out of view; pan or zoom the map to list them.');
    });

    // @test unit: the station heading and "No level" each have a zoom button (the whole station, or its features with no level)
    it('zooms to a station, or to its features with no level', async () => {
      const { tools, wrapper } = await mountStations();
      const central = wrapper.findAll('[role="group"]').find(g => g.attributes('aria-label') === 'Central')!;

      await central.find('.level-group-heading .level-zoom').trigger('click');
      expect(tools.zoomToStation).toHaveBeenLastCalledWith('CENTRAL');

      const street = central.find('.level-view-row');
      expect(street.find('[role="radio"]').text()).toBe('No level');
      await street.find('.level-zoom').trigger('click');
      expect(tools.zoomToStation).toHaveBeenLastCalledWith('CENTRAL', { noLevel: true });
      expect(tools.showView).not.toHaveBeenCalled(); // zooming doesn't change the view
    });

    // @test unit: each level (and "No level") expands to list its nodes and edges in that station, under their own categories; clicking one selects it
    it('lists a level\'s nodes and edges in that station under it, and selects one when clicked', async () => {
      const { tools, wrapper } = await mountStations();
      tools.stopGroups.value = [
        { level: street, stops: [
          { id: 'c1', label: 'Entrance: Central North', levelId: 'L0', stationIds: ['CENTRAL'] },
          { id: 'a1', label: 'Entrance: Annex', levelId: 'L0', stationIds: ['ANNEX'] }
        ] },
        { level: concourse, stops: [] },
        { level: undefined, stops: [{ id: 'c9', label: 'Station: Central', levelId: undefined, stationIds: ['CENTRAL'] }] }
      ];
      tools.levelPathways.value = new Map([
        ['L0', [
          { id: 'w1', label: 'Stairs: North ↔ Mezzanine', stationIds: ['CENTRAL'] },
          { id: 'w2', label: 'Walkway: North ↔ Annex', stationIds: ['CENTRAL', 'ANNEX'] },
          { id: 'w3', label: 'Walkway: Annex ↔ Annex', stationIds: ['ANNEX'] }
        ]],
        ['', [{ id: 'w9', label: 'Walkway: Station ↔ North', stationIds: ['CENTRAL'] }]]
      ]);
      await nextTick();
      const central = () => wrapper.findAll('[role="group"]').find(g => g.attributes('aria-label') === 'Central')!;
      const row = (levelId: string) => central().findAll('.level-row').find(r => r.find('.level-title').text().includes(levelId))!;
      const items = (label: string) => central().find(`[aria-label="${label}"]`).findAll('.level-item').map(b => b.text());

      // Collapsed at first; counts are this station's nodes and edges.
      expect(central().find('.level-contents').exists()).toBe(false);
      expect(row('L0').findAll('.badge').map(badge => badge.text())).toEqual(['1 node', '2 edges']);
      expect(row('L1').findAll('.badge').map(badge => badge.text())).toEqual(['0 nodes', '0 edges']);
      expect(row('L1').find('.level-expand').attributes('disabled')).toBeDefined(); // nothing to list

      await row('L0').find('.level-expand').trigger('click');
      expect(row('L0').find('.level-expand').attributes('aria-expanded')).toBe('true');
      const contents = central().find('[aria-label="Contents of Street (L0)"]');
      expect(contents.findAll('.level-category-toggle').map(b => b.text())).toEqual(['Nodes (1)', 'Edges (2)']);
      expect(items('Nodes on Street (L0)')).toEqual(['Entrance: Central North']); // not Annex's
      expect(items('Edges on Street (L0)')).toEqual(['Stairs: North ↔ Mezzanine', 'Walkway: North ↔ Annex']);
      await contents.find('.level-item').trigger('click');
      expect(tools.select).toHaveBeenCalledWith('c1');
      expect(tools.select.mock.contexts.at(-1)).toBe(tools); // called on the tools, not detached

      // "No level" lists the station's nodes and edges with no level.
      await central().find('.level-view-row .level-expand').trigger('click');
      expect(items('Nodes with no level in Central')).toEqual(['Station: Central']);
      expect(items('Edges with no level in Central')).toEqual(['Walkway: Station ↔ North']);

      await row('L0').find('.level-expand').trigger('click');
      expect(central().find('[aria-label="Contents of Street (L0)"]').exists()).toBe(false);
    });

    // @test unit: pointing at a station's name, a level or a listed node or edge highlights it on the map
    it('highlights a station, a level\'s outline, or a listed item on the map while pointed at', async () => {
      const { tools, wrapper } = await mountStations();
      tools.stopGroups.value = [{ level: street, stops: [{ id: 'c1', label: 'Entrance: North', levelId: 'L0', stationIds: ['CENTRAL'] }] }];
      await nextTick();
      const central = () => wrapper.findAll('[role="group"]').find(g => g.attributes('aria-label') === 'Central')!;
      const calls = () => tools.highlight.mock.calls.filter(([ids]) => ids.length).map(([ids, on]) => [ids, on]);

      await central().find('.level-station-link').trigger('mouseenter');
      expect(calls().at(-1)).toEqual([['s1'], true]);
      await central().find('.level-station-link').trigger('mouseleave');
      expect(calls().at(-1)).toEqual([['s1'], false]);

      const streetRow = central().findAll('.level-row').find(r => r.find('.level-title').text().includes('L0'))!;
      await streetRow.find('.level-row-main').trigger('focus');
      expect(calls().at(-1)).toEqual([['a0'], true]); // its outline

      // A listed node, unhighlighted when its level collapses under the pointer.
      await streetRow.find('.level-expand').trigger('click');
      await central().find('.level-item').trigger('mouseenter');
      expect(calls().at(-1)).toEqual([['c1'], true]);
      await streetRow.find('.level-expand').trigger('click');
      expect(calls().at(-1)).toEqual([['c1'], false]);

      // And whatever's highlighted is cleared when the panel goes away.
      await central().find('.level-station-link').trigger('mouseenter');
      wrapper.unmount();
      expect(calls().at(-1)).toEqual([['s1'], false]);
    });

    // @test unit: clicking a station's name selects the station in the editor
    it('selects the station when its name is clicked', async () => {
      const { tools, wrapper } = await mountStations();

      const central = wrapper.findAll('.level-station-link').find(link => link.text() === 'Central')!;
      expect(central.attributes('title')).toBe('Select Central (stop_id CENTRAL) to see or edit it');
      await central.trigger('click');

      expect(tools.select).toHaveBeenCalledWith('s1');
    });

    // @test unit: each station starts with "No level", which shows that station's features that have no level
    it('starts each station with a No level entry for its unleveled features', async () => {
      const { tools, wrapper } = await mountStations();
      const stationRadios = (i: number) => wrapper.findAll('[role="group"]')[i]!.findAll('[role="radio"]');

      // First under each station, above its levels.
      expect([0, 1].map(i => stationRadios(i).map(option => option.text().replace(/\s+/g, ' ')))).toEqual([
        ['No level', expect.stringContaining('Street (L0)')],
        ['No level', expect.stringContaining('Upper (UP)'), expect.stringContaining('Street (L0)'),
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
