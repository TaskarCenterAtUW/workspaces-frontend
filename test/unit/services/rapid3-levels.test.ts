import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEVEL_FILTER_ID, Rapid3LevelTools } from '~/services/rapid3-levels';

// Rapid3LevelTools against a minimal fake of the Rapid 3 context: a two-layer
// graph (base + local edits), an editor that applies the actions it's given,
// and the FilterSystem methods the level filter wraps.

type Entity = { id: string; type: string; tags?: Record<string, string>; nodes?: string[] };

function fakeContext(entities: Entity[]) {
  const base = new Map(entities.map(entity => [entity.id, entity]));
  const local = new Map<string, Entity | undefined>();
  const graph = {
    base: { entities: base },
    local: { entities: local },
    hasEntity: (id: string) => (local.has(id) ? local.get(id) : base.get(id)),
    parentWays: (node: Entity) => [...new Set([...base.keys(), ...local.keys()])]
      .map(id => graph.hasEntity(id))
      .filter((e): e is Entity => Boolean(e) && e!.type === 'way' && e!.nodes!.includes(node.id))
  };

  const listeners = new Map<string, (() => void)[]>();
  const editor = {
    staging: { graph },
    on: (event: string, fn: () => void) => listeners.set(event, [...(listeners.get(event) ?? []), fn]),
    perform: vi.fn((...actions: ((g: typeof graph) => void)[]) => actions.forEach(action => action(graph))),
    commit: vi.fn()
  };
  const filters = {
    _forceVisible: new Set<string>(),
    isHidden: vi.fn((_entity: unknown, _graph: unknown, _geometry: string): string | null => null),
    filterScene: vi.fn((list: Entity[], _graph: unknown) => list),
    emit: vi.fn()
  };

  return {
    graph,
    local,
    systems: {
      editor,
      filters,
      map: { fitEntitiesEase: vi.fn() },
      gfx: { immediateRedraw: vi.fn() }
    },
    enter: vi.fn()
  };
}

const node = (id: string, tags?: Record<string, string>): Entity => ({ id, type: 'node', ...(tags ? { tags } : {}) });
const way = (id: string, nodes: string[], tags?: Record<string, string>): Entity => ({ id, type: 'way', nodes, ...(tags ? { tags } : {}) });

// Street level L0 with a platform and an unleveled entrance; L1 below with a node.
const station = () => [
  way('a0', ['c1', 'c2', 'c3', 'c1'], { area: 'yes', level_id: 'L0', level_index: '0', level_name: 'Street' }),
  way('a1', ['d1', 'd2', 'd3', 'd1'], { area: 'yes', level_id: 'L1', level_index: '-1', level_name: 'Concourse' }),
  node('c1'), node('c2'), node('c3'), node('d1'), node('d2'), node('d3'),
  node('n1', { location_type: '0', level_id: 'L0', stop_name: 'Platform A' }),
  node('n2', { location_type: '3', level_id: 'L1' }),
  node('n3', { location_type: '2', stop_name: 'Main entrance' })
];

beforeEach(() => {
  (globalThis as any).Rapid = {
    actionChangeTags: (id: string, tags: Record<string, string>) =>
      (graph: any) => graph.local.entities.set(id, { ...graph.hasEntity(id), tags })
  };
});

afterEach(() => {
  delete (globalThis as any).Rapid;
});

describe('Rapid3LevelTools', () => {
  it('lists levels by index, stops grouped by level, and stops missing a level', () => {
    const tools = new Rapid3LevelTools(fakeContext(station()));

    expect(tools.levels.value.map(level => level.levelId)).toEqual(['L1', 'L0']);
    expect(tools.stopGroups.value.map(group => [group.level?.levelId, group.stops.map(stop => stop.label)])).toEqual([
      ['L1', ['Node: n2']],
      ['L0', ['Platform: Platform A']],
      [undefined, ['Entrance: Main entrance']]
    ]);
    // n3 is an entrance, which may be left without a level (street level).
    expect(tools.unleveled.value).toEqual([]);
  });

  it('flags platforms and nodes without a level', () => {
    const tools = new Rapid3LevelTools(fakeContext([
      ...station(),
      node('n8', { location_type: '0', stop_name: 'Platform B' })
    ]));

    expect(tools.unleveled.value.map(stop => stop.label)).toEqual(['Platform: Platform B']);
  });

  it('hides other levels in the rendered scene and in hit tests while a level is shown', () => {
    const context = fakeContext(station());
    const { filters, gfx } = context.systems;
    const tools = new Rapid3LevelTools(context);
    const all = station();
    const shown = () => filters.filterScene(all, context.graph).map((entity: Entity) => entity.id);

    expect(shown()).toHaveLength(all.length);

    tools.showLevel('L0');
    expect(filters.emit).toHaveBeenCalledWith('filterchange');
    expect(gfx.immediateRedraw).toHaveBeenCalled();
    expect(shown()).toEqual(['a0', 'c1', 'c2', 'c3', 'n1', 'n3']);
    expect(filters.isHidden(context.graph.hasEntity('n2'), context.graph, 'point')).toBe(LEVEL_FILTER_ID);
    expect(filters.isHidden(context.graph.hasEntity('n1'), context.graph, 'point')).toBeNull();

    tools.showLevel(undefined);
    expect(shown()).toHaveLength(all.length);
  });

  it('keeps force-visible features (e.g. the selection) visible on other levels', () => {
    const context = fakeContext(station());
    const tools = new Rapid3LevelTools(context);
    context.systems.filters._forceVisible.add('n2');

    tools.showLevel('L0');

    expect(context.systems.filters.isHidden(context.graph.hasEntity('n2'), context.graph, 'point')).toBeNull();
  });

  it('sets the level on stops as one undoable edit', () => {
    const context = fakeContext(station());
    const tools = new Rapid3LevelTools(context);

    tools.assignLevel(['n3'], 'L0');
    tools.refresh();

    expect(context.systems.editor.perform).toHaveBeenCalledTimes(1);
    expect(context.systems.editor.commit).toHaveBeenCalledWith({ annotation: 'Set level L0', selectedIDs: ['n3'] });
    expect(context.graph.hasEntity('n3')!.tags).toEqual({ location_type: '2', stop_name: 'Main entrance', level_id: 'L0' });
    expect(tools.unleveled.value).toEqual([]);
  });

  it('shows all levels again when the shown level disappears', () => {
    const context = fakeContext(station());
    const tools = new Rapid3LevelTools(context);
    tools.showLevel('L1');

    context.local.set('a1', undefined); // level area deleted
    context.local.set('n2', { ...context.graph.hasEntity('n2')!, tags: { location_type: '3' } });
    tools.refresh();

    expect(tools.currentLevelId.value).toBeUndefined();
  });

  it('starts drawing a new level one index above the highest, with a generated level_id', () => {
    const context = fakeContext(station());
    const drawMode = { defaultTags: { area: 'yes' } };
    context.enter.mockReturnValue(drawMode);
    const tools = new Rapid3LevelTools(context);
    tools.showLevel('L0');

    tools.drawLevel();

    expect(context.enter).toHaveBeenCalledWith('draw-area');
    // Index 1 is next; "L1" is already taken (by the -1 level), so it gets a suffix.
    expect(drawMode.defaultTags).toEqual({ area: 'yes', level_id: 'L1-2', level_index: '1' });
    // A brand-new level isn't in the list yet, so show everything while drawing it.
    expect(tools.currentLevelId.value).toBeUndefined();
  });

  it('starts the first level at index 0 as L0', () => {
    const context = fakeContext([node('n1', { stop_name: 'A' })]);
    const drawMode = { defaultTags: {} };
    context.enter.mockReturnValue(drawMode);

    new Rapid3LevelTools(context).drawLevel();

    expect(drawMode.defaultTags).toEqual({ area: 'yes', level_id: 'L0', level_index: '0' });
  });

  it('outlines an existing level that only stops use, keeping its level_id', () => {
    const context = fakeContext([...station(), node('n9', { level_id: 'ROOF', stop_name: 'Roof' })]);
    const drawMode = { defaultTags: {} };
    context.enter.mockReturnValue(drawMode);
    const tools = new Rapid3LevelTools(context);
    const roof = tools.levels.value.find(level => level.levelId === 'ROOF')!;
    expect(roof.areaIds).toEqual([]);

    tools.drawLevel(roof);

    expect(drawMode.defaultTags).toEqual({ area: 'yes', level_id: 'ROOF', level_index: '1' });
    expect(tools.currentLevelId.value).toBe('ROOF');
  });

  it('fills a generated level_id on a level area missing one', () => {
    const context = fakeContext([
      ...station(),
      way('a2', ['e1', 'e2', 'e3', 'e1'], { area: 'yes', level_index: '-1', level_name: 'Lower' })
    ]);
    const tools = new Rapid3LevelTools(context);
    expect(tools.levelAreasMissingId.value.map(area => area.id)).toEqual(['a2']);

    expect(tools.fillLevelId('a2')).toBe('L-1');
    tools.refresh();

    expect(context.graph.hasEntity('a2')!.tags!.level_id).toBe('L-1');
    expect(context.systems.editor.commit).toHaveBeenCalledWith({ annotation: 'Set level_id L-1', selectedIDs: ['a2'] });
    expect(tools.levelAreasMissingId.value).toEqual([]);
    expect(tools.fillLevelId('a2')).toBeUndefined(); // already has one
  });
});
