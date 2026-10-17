import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changedStopLevels, FAR_END_ALPHA, graphEntities, LEVEL_FILTER_ID, Rapid3LevelTools, STATION_HIGHLIGHT } from '~/services/rapid3-levels';

// Rapid3LevelTools against a minimal fake of the Rapid 3 context: a two-layer
// graph (base + local edits), an editor that applies the actions it's given,
// and the FilterSystem methods the level filter wraps.

type Entity = { id: string; type: string; tags?: Record<string, string>; nodes?: string[]; loc?: [number, number] };

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

  const listeners = new Map<string, ((...args: any[]) => void)[]>();
  const editor = {
    staging: { graph },
    on: (event: string, fn: (...args: any[]) => void) => listeners.set(event, [...(listeners.get(event) ?? []), fn]),
    perform: vi.fn((...actions: ((g: typeof graph) => void)[]) => actions.forEach(action => action(graph))),
    commit: vi.fn(),
    commitAppend: vi.fn(),
    getUndoAnnotation: () => 'Changed tags',
    /** Test helper: fires an editor event's listeners. */
    emit: (event: string, ...args: unknown[]) => (listeners.get(event) ?? []).forEach(fn => fn(...args))
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

let newIds = 0;

beforeEach(() => {
  (globalThis as any).Rapid = {
    actionChangeTags: (id: string, tags: Record<string, string>) =>
      (graph: any) => graph.local.entities.set(id, { ...graph.hasEntity(id), tags }),
    actionAddEntity: (entity: Entity) => (graph: any) => graph.local.entities.set(entity.id, entity),
    actionMoveNode: (id: string, loc: [number, number]) => (graph: any) =>
      graph.local.entities.set(id, { ...graph.hasEntity(id), loc }),
    actionDeleteNode: (id: string) => (graph: any) => graph.local.entities.set(id, undefined),
    OsmNode: function (this: Entity, _context: unknown, props: { loc: [number, number] }) {
      Object.assign(this, { id: `n-${++newIds}`, type: 'node', loc: props.loc });
    },
    OsmWay: function (this: Entity, _context: unknown, props: { nodes: string[]; tags: Record<string, string> }) {
      Object.assign(this, { id: `w-${++newIds}`, type: 'way', nodes: props.nodes, tags: props.tags });
    }
  };
  newIds = 0;
});

afterEach(() => {
  delete (globalThis as any).Rapid;
});

describe('Rapid3LevelTools', () => {
  it('lists levels by index, stops grouped by level, and stops missing a level', () => {
    const tools = new Rapid3LevelTools(fakeContext(station()));

    expect(tools.levels.value.map(level => level.levelId)).toEqual(['L1', 'L0']);
    expect(tools.stopGroups.value.map(group => [group.level?.levelId, group.stops.map(stop => stop.label)])).toEqual([
      ['L1', ['Generic Node: n2']],
      ['L0', ['Platform: Platform A']],
      [undefined, ['Entrance: Main entrance']]
    ]);
    // n3 is an entrance, which may be left without a level (street level).
    expect(tools.unleveled.value).toEqual([]);
    // No stations in this data, so every level is in one unnamed group.
    expect(tools.levelGroups.value.map(group => [group.station, group.levels.map(level => level.levelId)]))
      .toEqual([[undefined, ['L1', 'L0']]]);
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

  it('names a filled level_id after the stations with stops inside the outline', () => {
    const at = (entity: Entity, loc: [number, number]): Entity => ({ ...entity, loc });
    const context = fakeContext([
      at(node('s1', { location_type: '1', stop_id: 'STN_J02', stop_name: 'Van Dorn' }), [0, 0]),
      at(node('n1', { location_type: '3', parent_station: 'STN_J02' }), [0.0005, 0.0005]),
      at(node('s2', { location_type: '1', stop_id: 'STN_K01', stop_name: 'Far' }), [5, 5]),
      way('a2', ['c1', 'c2', 'c3', 'c1'], { area: 'yes', level_index: '-1' }),
      at(node('c1'), [-0.001, -0.001]), at(node('c2'), [0.001, -0.001]), at(node('c3'), [0.001, 0.001])
    ]);
    const tools = new Rapid3LevelTools(context);

    expect(tools.fillLevelId('a2')).toBe('J02_L-1');
  });

  it('renumbers level_index on every outline of each moved level, as one edit', () => {
    const context = fakeContext([
      ...station(),
      way('a0b', ['f1', 'f2', 'f3', 'f1'], { area: 'yes', level_id: 'L0', level_index: '0' }), // 2nd outline of L0
      way('a2', ['e1', 'e2', 'e3', 'e1'], { area: 'yes', level_id: 'UP', level_index: '1' }),
      node('n9', { level_id: 'ROOF', stop_name: 'Roof' }) // no outline: can't be reordered
    ]);
    const tools = new Rapid3LevelTools(context);

    // Move UP from the top to below the concourse; street stays 0.
    tools.reorderLevels(['UP', 'L1', 'L0', 'ROOF']);

    const index = (id: string) => context.graph.hasEntity(id)!.tags!.level_index;
    expect([index('a0'), index('a0b'), index('a1'), index('a2')]).toEqual(['0', '0', '-1', '-2']);
    expect(context.systems.editor.perform).toHaveBeenCalledTimes(1);
    expect(context.systems.editor.perform.mock.calls[0]).toHaveLength(1); // only UP changed
    expect(context.systems.editor.commit).toHaveBeenCalledWith({ annotation: 'Reordered levels', selectedIDs: [] });
    expect(tools.levels.value.map(level => [level.levelId, level.index])).toEqual([
      ['UP', -2], ['L1', -1], ['L0', 0], ['ROOF', undefined]
    ]);
  });

  it('flags level outlines that are very large, labeled by name and level_id', () => {
    const at = (entity: Entity, loc: [number, number]): Entity => ({ ...entity, loc });
    const tools = new Rapid3LevelTools(fakeContext([
      way('a0', ['c1', 'c2', 'c3', 'c1'], { area: 'yes', level_id: 'L0', level_index: '0', level_name: 'Street' }),
      way('a1', ['d1', 'd2', 'd3', 'd1'], { area: 'yes', level_id: 'L1', level_index: '-1' }),
      at(node('c1'), [0, 0]), at(node('c2'), [0.02, 0]), at(node('c3'), [0.02, 0.001]), // ~2.2 km
      at(node('d1'), [0, 0]), at(node('d2'), [0.001, 0]), at(node('d3'), [0.001, 0.001]) // ~111 m
    ]));

    expect(tools.largeLevelAreas.value.map(({ id, label, levelId, meters }) => [id, label, levelId, Math.round(meters)]))
      .toEqual([['a0', 'Street (L0)', 'L0', 2226]]);
  });

  it('flags stops far from the rest of their level', () => {
    const at = (entity: Entity, loc: [number, number]): Entity => ({ ...entity, loc });
    const tools = new Rapid3LevelTools(fakeContext([
      at(node('n1', { location_type: '3', level_id: 'L0' }), [0, 0]),
      at(node('n2', { location_type: '3', level_id: 'L0' }), [0.0005, 0]),
      at(node('n3', { location_type: '3', level_id: 'L0' }), [0, 0.0005]),
      at(node('n4', { location_type: '2', level_id: 'L0', stop_name: 'Far entrance' }), [0.02, 0])
    ]));

    expect(tools.farStops.value.map(({ id, label, levelId, meters }) => [id, label, levelId, Math.round(meters)]))
      .toEqual([['n4', 'Entrance: Far entrance', 'L0', 2199]]);
  });

  describe('refitting a level outline', () => {
    const at = (entity: Entity, loc: [number, number]): Entity => ({ ...entity, loc });
    // An outline way, with the update() a Rapid OsmWay has.
    const outline = (id: string, nodes: string[], tags: Record<string, string>) =>
      ({ ...way(id, nodes, tags), update(props: Partial<Entity>) {
        return { ...this, ...props };
      } });
    // Two stops on L0 near the origin (~111 m apart east-west).
    const stops = () => [
      at(node('n1', { location_type: '3', level_id: 'L0' }), [0, 0]),
      at(node('n2', { location_type: '3', level_id: 'L0' }), [0.001, 0]),
      at(node('n9', { location_type: '3', level_id: 'L1' }), [5, 5]) // another level: ignored
    ];
    const locOf = (context: ReturnType<typeof fakeContext>, id: string) => context.graph.hasEntity(id)!.loc!;

    it('moves a four-corner outline\'s corners onto a box around its level\'s stops', () => {
      // Stretched ~2 km east by a stop that has since been fixed.
      const context = fakeContext([
        ...stops(),
        outline('a0', ['c1', 'c2', 'c3', 'c4', 'c1'], { area: 'yes', level_id: 'L0', level_index: '0' }),
        at(node('c1'), [0, 0]), at(node('c2'), [0.02, 0]), at(node('c3'), [0.02, 0.001]), at(node('c4'), [0, 0.001])
      ]);
      const tools = new Rapid3LevelTools(context);
      expect(tools.largeLevelAreas.value.map(area => area.id)).toEqual(['a0']);

      expect(tools.refitLevelArea('a0')).toBe(true);
      const lons = ['c1', 'c2', 'c3', 'c4'].map(id => locOf(context, id)[0]);
      expect(Math.min(...lons)).toBeLessThan(0); // padded past the stops...
      expect(Math.max(...lons)).toBeGreaterThan(0.001);
      expect(Math.max(...lons)).toBeLessThan(0.002); // ...but no longer stretched
      expect(context.graph.hasEntity('a0')!.nodes).toEqual(['c1', 'c2', 'c3', 'c4', 'c1']); // same corners
      expect(context.systems.editor.perform).toHaveBeenCalledTimes(1);
      expect(context.systems.editor.commit).toHaveBeenCalledWith({
        annotation: 'Refit level L0\'s outline to its stops',
        selectedIDs: ['a0']
      });
      expect(tools.largeLevelAreas.value).toEqual([]); // the warning clears
    });

    it('gives a reshaped outline four new corners, deleting old ones nothing else uses', () => {
      const context = fakeContext([
        ...stops(),
        outline('a0', ['c1', 'c2', 'c3', 'c4', 'c5', 'c1'], { area: 'yes', level_id: 'L0', level_index: '0' }),
        way('w9', ['c5', 'x1']), // c5 is shared with another way: kept
        at(node('c1'), [0, 0]), at(node('c2'), [0.02, 0]), at(node('c3'), [0.02, 0.001]),
        at(node('c4'), [0.01, 0.002]), at(node('c5'), [0, 0.001]), at(node('x1'), [0, 0.01])
      ]);
      const tools = new Rapid3LevelTools(context);

      expect(tools.refitLevelArea('a0')).toBe(true);
      const nodes = context.graph.hasEntity('a0')!.nodes!;
      expect(nodes).toHaveLength(5);
      expect(nodes[0]).toBe(nodes[4]); // still closed
      expect(nodes.every(id => id.startsWith('n-'))).toBe(true); // new corners
      expect(['c1', 'c2', 'c3', 'c4'].map(id => context.graph.hasEntity(id))).toEqual([undefined, undefined, undefined, undefined]);
      expect(context.graph.hasEntity('c5')).toBeDefined();
      expect(context.systems.editor.perform).toHaveBeenCalledTimes(1);
    });

    it('keeps flagging a stretched outline after its stray stop is fixed, until it\'s refit', () => {
      const context = fakeContext([
        ...stops(),
        at(node('far', { location_type: '2', level_id: 'L0' }), [0.02, 0]), // ~2 km away
        at(node('n3', { location_type: '3', level_id: 'L0' }), [0, 0.0005]),
        outline('a0', ['c1', 'c2', 'c3', 'c4', 'c1'], { area: 'yes', level_id: 'L0', level_index: '0' }),
        at(node('c1'), [0, 0]), at(node('c2'), [0.02, 0]), at(node('c3'), [0.02, 0.001]), at(node('c4'), [0, 0.001])
      ]);
      const tools = new Rapid3LevelTools(context);
      expect(tools.farStops.value.map(stop => stop.id)).toEqual(['far']);

      // The stray stop was on the wrong level.
      context.local.set('far', { ...context.graph.hasEntity('far')!, tags: { location_type: '2', level_id: 'L1' } });
      tools.refresh();
      expect(tools.farStops.value).toEqual([]);
      const [large] = tools.largeLevelAreas.value;
      expect([large!.id, large!.oversized, Math.round(large!.stopsMeters!)]).toEqual(['a0', true, 131]);

      tools.refitLevelArea('a0');
      expect(tools.largeLevelAreas.value).toEqual([]);
    });

    describe('automatically, as stops change level', () => {
      // L0: two stops near the origin, but its box outline is stretched ~2 km
      // east to a stop that's really on L1. L1's box sits ~2 km east.
      function stretched(extra: Entity[] = []) {
        const context = fakeContext([
          ...stops(),
          at(node('far', { location_type: '2', level_id: 'L0' }), [0.02, 0]),
          outline('a0', ['c1', 'c2', 'c3', 'c4', 'c1'], { area: 'yes', level_id: 'L0', level_index: '0' }),
          at(node('c1'), [0, 0]), at(node('c2'), [0.02, 0]), at(node('c3'), [0.02, 0.001]), at(node('c4'), [0, 0.001]),
          outline('a1', ['d1', 'd2', 'd3', 'd4', 'd1'], { area: 'yes', level_id: 'L1', level_index: '-1' }),
          at(node('d1'), [5, 5]), at(node('d2'), [5.001, 5]), at(node('d3'), [5.001, 5.001]), at(node('d4'), [5, 5.001]),
          ...extra
        ]);
        return { context, tools: new Rapid3LevelTools(context) };
      }
      /** Changes a stop's tags as an edit, firing 'stablechange' with its difference. */
      function retag(context: ReturnType<typeof fakeContext>, id: string, tags: Record<string, string>) {
        const base = context.graph.hasEntity(id)!;
        const head = { ...base, tags };
        context.local.set(id, head);
        context.systems.editor.emit('stablechange', { changes: new Map([[id, { base, head }]]) });
      }
      const lons = (context: ReturnType<typeof fakeContext>, ids: string[]) => ids.map(id => locOf(context, id)[0]);

      it('refits the old and new levels\' box outlines, folded into the same edit', async () => {
        const { context, tools } = stretched();
        expect(tools.largeLevelAreas.value.map(area => area.id)).toContain('a0');

        retag(context, 'far', { location_type: '2', level_id: 'L1' });
        await Promise.resolve();

        // L0 shrinks back around its own two stops...
        expect(Math.max(...lons(context, ['c1', 'c2', 'c3', 'c4']))).toBeLessThan(0.002);
        // ...and L1 now reaches the stop that moved to it (its only stop).
        expect(Math.min(...lons(context, ['d1', 'd2', 'd3', 'd4']))).toBeLessThan(0.02);
        expect(Math.max(...lons(context, ['d1', 'd2', 'd3', 'd4']))).toBeGreaterThan(0.02);
        expect(context.systems.editor.perform).toHaveBeenCalledTimes(1);
        expect(context.systems.editor.commitAppend).toHaveBeenCalledWith({ annotation: 'Changed tags', selectedIDs: [] });
        expect(context.systems.editor.commit).not.toHaveBeenCalled();
        expect(tools.largeLevelAreas.value.map(area => area.id)).not.toContain('a0');
      });

      it('doesn\'t refit on undo or redo', async () => {
        const { context } = stretched();
        retag(context, 'far', { location_type: '2', level_id: 'L1' });
        context.systems.editor.emit('historyjump', 1, 0); // fired right after, as undo does
        await Promise.resolve();
        expect(context.systems.editor.perform).not.toHaveBeenCalled();
      });

      it('leaves hand-shaped outlines, levels with two outlines, and edits that don\'t move stops between levels', async () => {
        const shaped = stretched([
          outline('a2', ['g1', 'g2', 'g3', 'g4', 'g5', 'g1'], { area: 'yes', level_id: 'L2', level_index: '2' }),
          at(node('g1'), [0, 0]), at(node('g2'), [1, 0]), at(node('g3'), [1, 1]), at(node('g4'), [0.5, 1.5]), at(node('g5'), [0, 1]),
          at(node('n5', { location_type: '3', level_id: 'L2' }), [0.5, 0.5])
        ]);
        retag(shaped.context, 'n5', { location_type: '3', level_id: 'L2', stop_name: 'Renamed' }); // same level
        await Promise.resolve();
        expect(shaped.context.systems.editor.perform).not.toHaveBeenCalled();
        retag(shaped.context, 'n1', { location_type: '3', level_id: 'L2' }); // L0 -> L2 (hand-shaped)
        await Promise.resolve();
        expect(shaped.context.graph.hasEntity('a2')!.nodes).toEqual(['g1', 'g2', 'g3', 'g4', 'g5', 'g1']);
        expect(locOf(shaped.context, 'g4')).toEqual([0.5, 1.5]);

        const doubled = stretched([
          outline('a9', ['h1', 'h2', 'h3', 'h4', 'h1'], { area: 'yes', level_id: 'L0', level_index: '0' }),
          at(node('h1'), [0, 0]), at(node('h2'), [0.03, 0]), at(node('h3'), [0.03, 0.001]), at(node('h4'), [0, 0.001])
        ]);
        retag(doubled.context, 'far', { location_type: '2', level_id: 'L1' }); // L0 has two outlines
        await Promise.resolve();
        expect(doubled.context.graph.hasEntity('h2')!.loc).toEqual([0.03, 0]); // untouched
        expect(locOf(doubled.context, 'c2')).toEqual([0.02, 0]);
      });

      it('gives a level the edit put stops on an outline if it has none, in the same edit', async () => {
        const { context, tools } = stretched();
        retag(context, 'far', { location_type: '2', level_id: 'L3' });
        await Promise.resolve();

        const l3 = graphEntities(context.graph).filter(e => e.type === 'way' && e.tags?.level_id === 'L3');
        expect(l3).toHaveLength(1);
        expect(l3[0]!.tags).toEqual({ area: 'yes', level_id: 'L3', level_index: '1' }); // above the highest
        expect(context.systems.editor.perform).toHaveBeenCalledTimes(1); // with L0's refit
        expect(context.systems.editor.commitAppend).toHaveBeenCalledTimes(1);
        expect(tools.levels.value.find(level => level.levelId === 'L3')!.areaIds).toHaveLength(1);
      });
    });

    it('outlines every level that has stops but no outline, as one edit', () => {
      const context = fakeContext([
        ...stops(), // L0 (two stops) and L1 (one), neither outlined
        node('n8', { location_type: '3', level_id: 'L8' }), // no location: can't be boxed
        outline('a5', ['c1', 'c2', 'c3', 'c1'], { area: 'yes', level_id: 'L5', level_index: '4' }),
        at(node('c1'), [3, 3]), at(node('c2'), [3.001, 3]), at(node('c3'), [3.001, 3.001]),
        at(node('n5', { location_type: '3', level_id: 'L5' }), [3, 3])
      ]);
      const tools = new Rapid3LevelTools(context);

      expect(tools.outlineMissingLevels()).toBe(2);
      const outlined = graphEntities(context.graph).filter(e => e.type === 'way' && e.id.startsWith('w-'));
      expect(outlined.map(way => [way.tags!.level_id, way.tags!.level_index]).sort()).toEqual([['L0', '5'], ['L1', '6']]);
      expect(context.systems.editor.commit).toHaveBeenCalledWith({ annotation: 'Outlined 2 levels', selectedIDs: [] });

      // Nothing left to do: no edit.
      expect(tools.outlineMissingLevels()).toBe(0);
      expect(context.systems.editor.commit).toHaveBeenCalledTimes(1);
    });

    it('changes nothing for an outline without a level_id, or a level with no located stops', () => {
      const context = fakeContext([
        ...stops(),
        outline('a7', ['c1', 'c2', 'c3', 'c1'], { area: 'yes', level_index: '0' }),
        outline('a8', ['c1', 'c2', 'c3', 'c1'], { area: 'yes', level_id: 'EMPTY', level_index: '1' }),
        at(node('c1'), [0, 0]), at(node('c2'), [1, 0]), at(node('c3'), [1, 1])
      ]);
      const tools = new Rapid3LevelTools(context);

      expect(tools.refitLevelArea('a7')).toBe(false);
      expect(tools.refitLevelArea('a8')).toBe(false);
      expect(tools.refitLevelArea('missing')).toBe(false);
      expect(context.systems.editor.perform).not.toHaveBeenCalled();
    });
  });

  it('counts the pathways touching each level, with their stations', () => {
    const tools = new Rapid3LevelTools(fakeContext([
      node('s1', { location_type: '1', stop_id: 'CENTRAL' }),
      node('a', { location_type: '2', parent_station: 'CENTRAL', level_id: 'L0' }),
      node('b', { location_type: '3', parent_station: 'CENTRAL', level_id: 'L1' }),
      node('c', { location_type: '3', level_id: 'L1' }), // in no station
      node('bend'),
      way('p1', ['a', 'bend', 'b'], { pathway_mode: '2' }), // stairs between L0 and L1: counts on both
      way('p2', ['b', 'c'], { pathway_mode: '1' }),
      way('p3', ['c', 'bend'], { pathway_mode: '1' })
    ]));
    const counted = Object.fromEntries([...tools.levelPathways.value].map(([levelId, pathways]) =>
      [levelId, pathways.map(pathway => `${pathway.id}:${pathway.stationIds.join(',')}`)]));
    expect(counted).toEqual({ L0: ['p1:CENTRAL'], L1: ['p1:CENTRAL', 'p2:CENTRAL', 'p3:'] });
  });

  it('makes no edit when the order is unchanged', () => {
    const context = fakeContext(station());
    const tools = new Rapid3LevelTools(context);

    tools.reorderLevels(['L1', 'L0']);

    expect(context.systems.editor.perform).not.toHaveBeenCalled();
    expect(context.systems.editor.commit).not.toHaveBeenCalled();
  });

  describe('station highlight', () => {
    // Fake Pixi objects: Graphics records the boxes drawn since its last
    // clear(); Text and Container hold just what the highlight sets.
    class FakeGraphics {
      label = '';
      eventMode = '';
      parent: unknown;
      boxes: { x: number; y: number; w: number; h: number; fill?: unknown }[] = [];
      clear() {
        this.boxes = [];
        return this;
      }

      rect(x: number, y: number, w: number, h: number) {
        this.boxes.push({ x, y, w, h });
        return this;
      }

      fill(style: unknown) {
        this.boxes.at(-1)!.fill = style;
        return this;
      }
    }
    class FakeText {
      text: string;
      style: unknown;
      eventMode = '';
      destroyed = false;
      onRender?: () => void;
      scale = { x: 1, set(value: number) {
        this.x = value;
      } };

      position = { x: 0, y: 0, set(x: number, y: number) {
        this.x = x;
        this.y = y;
      } };

      constructor({ text, style }: { text: string; style: unknown }) {
        this.text = text;
        this.style = style;
      }

      destroy() {
        this.destroyed = true;
      }
    }
    class FakeContainer {
      label = '';
      eventMode = '';
      parent: unknown;
      children: FakeText[] = [];
      addChild(child: FakeText) {
        this.children.push(child);
      }

      removeChildren() {
        return this.children.splice(0);
      }
    }

    function contextWithScene(selected: string[] = []) {
      const at = (entity: Entity, loc: [number, number]): Entity => ({ ...entity, loc });
      const context = fakeContext([
        at(node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }), [0, 0]),
        at(node('e1', { location_type: '2', parent_station: 'CENTRAL', level_id: 'L0' }), [0.001, 0.001]),
        at(node('s2', { location_type: '1', stop_id: 'ANNEX', stop_name: 'Annex' }), [1, 1])
      ]);
      const group = {
        children: [] as unknown[],
        addChild(child: { parent?: unknown }) {
          child.parent = this;
          this.children.push(child);
        }
      };
      const origin = { scale: { x: 1 } };
      Object.assign(context.systems.gfx, {
        scene: { groups: new Map([['debug-under', group]]) },
        origin,
        deferredRedraw: vi.fn()
      });
      const modeListeners: (() => void)[] = [];
      Object.assign(context, {
        on: (event: string, fn: () => void) => {
          if (event === 'modechange') modeListeners.push(fn);
        },
        selectedIDs: () => selected
      });
      return {
        context,
        origin,
        boxes: () => group.children[0] as FakeGraphics,
        labels: () => (group.children[1] as FakeContainer).children,
        group,
        changeMode: () => modeListeners.forEach(fn => fn())
      };
    }

    beforeEach(() => {
      (globalThis as any).PIXI = { Graphics: FakeGraphics, Container: FakeContainer, Text: FakeText };
      // Identity-ish projection: world x = lon, world y = -lat (north is up).
      (globalThis as any).Rapid.sdk = { projWgs84ToWorld: ([lon, lat]: [number, number]) => [lon, -lat] };
    });
    afterEach(() => {
      delete (globalThis as any).PIXI;
    });

    it('draws a translucent white box around the shown station\'s point and stops, under the data', () => {
      const { context, group, boxes } = contextWithScene();
      const tools = new Rapid3LevelTools(context);
      expect(boxes().boxes).toEqual([]); // nothing shown yet

      tools.showView({ kind: 'stationNoLevel', stationId: 'CENTRAL' });
      expect(group.children).toHaveLength(2); // the boxes, and their labels
      expect(boxes().eventMode).toBe('none'); // doesn't block clicks on the map
      const [box] = boxes().boxes;
      expect(box!.fill).toEqual({ color: 0xffffff, alpha: 0.5 });
      // Covers lon 0..0.001 and lat 0..0.001, padded on every side.
      expect(box!.x).toBeLessThan(0);
      expect(box!.x + box!.w).toBeGreaterThan(0.001);
      expect(box!.y).toBeLessThan(-0.001);
      expect(box!.y + box!.h).toBeGreaterThan(0);
      expect(box!.w).toBeLessThan(0.002); // not the far-away Annex

      // A level within the station highlights it too; showing everything clears it.
      tools.showView({ kind: 'level', levelId: 'L0' });
      expect(boxes().boxes).toHaveLength(1);
      tools.showView(undefined);
      expect(boxes().boxes).toEqual([]);
    });

    it('labels each box with its station in its top-left corner, the same size at any zoom', () => {
      const { context, origin, boxes, labels } = contextWithScene();
      const tools = new Rapid3LevelTools(context);
      tools.showView({ kind: 'stationNoLevel', stationId: 'CENTRAL' });

      const [label] = labels();
      expect(labels()).toHaveLength(1);
      expect(label!.text).toBe('Extent of Station Central');
      // Rapid's label look, inverted: white text outlined in black.
      expect(label!.style).toMatchObject({
        fill: { color: 0xffffff },
        fontSize: 12,
        stroke: { color: 0x000000, width: 3, join: 'round' }
      });
      expect(label!.eventMode).toBe('none');
      const [box] = boxes().boxes;
      expect(label!.position).toMatchObject({ x: box!.x + STATION_HIGHLIGHT.labelInsetPx, y: box!.y + STATION_HIGHLIGHT.labelInsetPx });

      // Zoomed in 4x: the label shrinks by 4x in world units, so it looks the same.
      origin.scale.x = 4;
      label!.onRender!();
      expect(label!.scale.x).toBe(0.25);
      expect(label!.position.x).toBeCloseTo(box!.x + 1);

      // Redrawing replaces the old labels.
      tools.showView(undefined);
      expect(label!.destroyed).toBe(true);
      expect(labels()).toEqual([]);
    });

    it('highlights a station selected in the editor', () => {
      const selected: string[] = [];
      const { context, boxes, changeMode } = contextWithScene(selected);
      new Rapid3LevelTools(context);

      selected.push('s2');
      changeMode();
      const [box] = boxes().boxes;
      expect(box!.x).toBeLessThan(1);
      expect(box!.x + box!.w).toBeGreaterThan(1);
    });

    it('draws nothing when Rapid doesn\'t expose Pixi', () => {
      delete (globalThis as any).PIXI;
      const { context, group } = contextWithScene();
      const tools = new Rapid3LevelTools(context);
      tools.showView({ kind: 'stationNoLevel', stationId: 'CENTRAL' });
      expect(group.children).toEqual([]);
    });
  });

  it('zooms to a station, or to its features with no level', () => {
    const context = fakeContext([
      node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }),
      node('e1', { location_type: '2', parent_station: 'CENTRAL' }),
      node('n1', { location_type: '3', parent_station: 'CENTRAL', level_id: 'L1' }),
      node('s2', { location_type: '1', stop_id: 'ANNEX' }),
      node('e2', { location_type: '2', parent_station: 'ANNEX' })
    ]);
    const tools = new Rapid3LevelTools(context);
    const fit = context.systems.map.fitEntitiesEase;
    const fitted = () => fit.mock.lastCall![0].map((entity: Entity) => entity.id).sort();

    tools.zoomToStation('CENTRAL');
    expect(fitted()).toEqual(['e1', 'n1', 's1']);
    tools.zoomToStation('CENTRAL', { noLevel: true });
    expect(fitted()).toEqual(['e1', 's1']);

    fit.mockClear();
    tools.zoomToStation('NOWHERE');
    expect(fit).not.toHaveBeenCalled();
  });

  describe('station views', () => {
    const withStation = () => [
      ...station(),
      node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }),
      node('e1', { location_type: '2', parent_station: 'CENTRAL' })
    ];

    it('filters the map to one station\'s features with no level', () => {
      const context = fakeContext(withStation());
      const tools = new Rapid3LevelTools(context);
      const all = withStation();

      tools.showView({ kind: 'stationNoLevel', stationId: 'CENTRAL' });

      expect(tools.currentLevelId.value).toBeUndefined();
      expect(context.systems.filters.filterScene(all, context.graph).map((entity: Entity) => entity.id))
        .toEqual(['s1', 'e1']);
    });

    it('lists the station with its (empty) level list after the no-station group', () => {
      const tools = new Rapid3LevelTools(fakeContext(withStation()));

      expect(tools.levelGroups.value.map(group => group.station?.name)).toEqual([undefined, 'Central']);
    });

    it('follows the view for the current level', () => {
      const tools = new Rapid3LevelTools(fakeContext(withStation()));

      tools.showLevel('L0');
      expect(tools.view.value).toEqual({ kind: 'level', levelId: 'L0' });
      expect(tools.currentLevelId.value).toBe('L0');

      tools.showView({ kind: 'noStation' });
      expect(tools.currentLevelId.value).toBeUndefined();
    });

    it('shows everything again when the viewed station disappears', () => {
      const context = fakeContext(withStation());
      const tools = new Rapid3LevelTools(context);
      tools.showView({ kind: 'stationNoLevel', stationId: 'CENTRAL' });

      context.local.set('s1', undefined); // station deleted
      tools.refresh();

      expect(tools.view.value).toBeUndefined();
    });
  });

  describe('stations in view', () => {
    // Central spans lon 0-1 (station point to entrance); Annex sits at lon 10.
    // Both use level L1, whose outline spans them, as a shared level's can.
    const at = (entity: Entity, loc: [number, number]): Entity => ({ ...entity, loc });
    const twoStations = () => [
      at(node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }), [0, 0]),
      at(node('s2', { location_type: '1', stop_id: 'ANNEX', stop_name: 'Annex' }), [10, 0]),
      at(node('e1', { location_type: '2', parent_station: 'CENTRAL' }), [1, 0]),
      at(node('n0', { location_type: '3', parent_station: 'CENTRAL', level_id: 'L1' }), [0, 0]),
      at(node('n1', { location_type: '3', parent_station: 'ANNEX', level_id: 'L1' }), [10, 0]),
      way('a1', ['d1', 'd2', 'd3', 'd1'], { area: 'yes', level_id: 'L1', level_index: '-1' }),
      at(node('d1'), [-1, -1]), at(node('d2'), [11, -1]), at(node('d3'), [11, 1])
    ];

    /** A context whose map shows lon `west` to `east` (lat -1 to 1). */
    function contextWithView(west: number, east: number) {
      const context = fakeContext(twoStations());
      const view = { min: [west, -1], max: [east, 1] };
      const drawListeners: (() => void)[] = [];
      (context.systems.map as any).extent = () => view;
      (context.systems.gfx as any).on = (event: string, fn: () => void) => {
        if (event === 'draw') drawListeners.push(fn);
      };
      return { context, moveMap: (newWest: number, newEast: number) => {
        view.min[0] = newWest;
        view.max[0] = newEast;
        drawListeners.forEach(fn => fn());
      } };
    }

    it('lists the stations whose station point or stops span part of the view', () => {
      expect([...new Rapid3LevelTools(contextWithView(0.9, 1.1).context).visibleStationIds.value!]).toEqual(['CENTRAL']);
      // Zoomed in between Central's station point and entrance.
      expect([...new Rapid3LevelTools(contextWithView(0.4, 0.6).context).visibleStationIds.value!]).toEqual(['CENTRAL']);
      expect([...new Rapid3LevelTools(contextWithView(9, 11).context).visibleStationIds.value!]).toEqual(['ANNEX']);
    });

    it('doesn\'t list a station just because a level it shares has an outline in view', () => {
      // Only the shared L1 outline (lon -1 to 11) is in view here.
      expect([...new Rapid3LevelTools(contextWithView(5, 6).context).visibleStationIds.value!]).toEqual([]);
    });

    it('updates as the map moves', () => {
      vi.useFakeTimers();
      try {
        const { context, moveMap } = contextWithView(-0.5, 0.5);
        const tools = new Rapid3LevelTools(context);

        moveMap(9.5, 10.5);
        expect([...tools.visibleStationIds.value!]).toEqual(['CENTRAL']); // batched
        vi.advanceTimersByTime(150);
        expect([...tools.visibleStationIds.value!]).toEqual(['ANNEX']);

        // Redraws that don't change what's in view leave the list as is.
        const listed = tools.visibleStationIds.value;
        moveMap(9.6, 10.6);
        vi.advanceTimersByTime(150);
        expect(tools.visibleStationIds.value).toBe(listed);
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves stations unfiltered when the view can\'t be checked', () => {
      const tools = new Rapid3LevelTools(fakeContext(twoStations()));
      expect(tools.visibleStationIds.value).toBeUndefined();
    });
  });

  describe('reference field choices', () => {
    const data = () => [
      ...station(), // levels L0 (Street) and L1 (Concourse), both drawn
      node('n9', { level_id: 'ROOF', stop_name: 'Roof' }), // level with no outline
      node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }),
      node('s2', { location_type: '1', stop_id: 'ANNEX' }),
      node('p1', { location_type: '0', stop_id: 'P1', stop_name: 'Platform 1', parent_station: 'CENTRAL' }),
      node('p2', { stop_id: 'P2', parent_station: 'CENTRAL' }), // empty location_type = platform
      node('b1', { location_type: '4', parent_station: 'P1' })
    ];

    it('offers drawn levels for level_id, lowest first, described by name and station', () => {
      const tools = new Rapid3LevelTools(fakeContext(data()));
      expect(tools.referenceChoices('level_id')).toEqual([
        { value: 'L1', label: 'Concourse (L1)', description: 'Concourse · No station' },
        { value: 'L0', label: 'Street (L0)', description: 'Street · No station' }
      ]);

      // Stations whose stops use a level describe it (all of them, for a shared
      // level); an unnamed level is described by its stations alone.
      const tools2 = new Rapid3LevelTools(fakeContext([
        ...data(),
        way('a5', ['d1', 'd2', 'd3', 'd1'], { area: 'yes', level_id: 'J02_L5', level_index: '5' }),
        node('e5', { location_type: '2', parent_station: 'CENTRAL', level_id: 'J02_L5' }),
        node('e6', { location_type: '2', parent_station: 'ANNEX', level_id: 'L0' }),
        node('e7', { location_type: '2', parent_station: 'CENTRAL', level_id: 'L0' })
      ]));
      expect(tools2.referenceChoices('level_id')!.map(c => [c.value, c.label, c.description])).toEqual([
        ['L1', 'Concourse (L1)', 'Concourse · No station'],
        ['L0', 'Street (L0)', 'Street · ANNEX, Central'],
        ['J02_L5', 'J02_L5', 'Central']
      ]);
    });

    it('offers stations for parent_station, or platforms for a boarding area', () => {
      const tools = new Rapid3LevelTools(fakeContext(data()));
      expect(tools.referenceChoices('parent_station', 'p1')).toEqual([
        { value: 'ANNEX', label: 'ANNEX' },
        { value: 'CENTRAL', label: 'Central (CENTRAL)' }
      ]);
      // Platforms without a stop_id (n1, and n9 with an empty location_type) are
      // offered under a suggested one.
      expect(tools.referenceChoices('parent_station', 'b1')).toEqual([
        { value: 'P2', label: 'P2' },
        { value: 'P1', label: 'Platform 1 (P1)' },
        { value: 'PLATFORM_A', label: 'Platform A (new stop_id PLATFORM_A)' },
        { value: 'ROOF', label: 'Roof (new stop_id ROOF)' }
      ]);
      expect(tools.referenceChoices('stop_name')).toBeUndefined();
    });

    it('labels the choices in Rapid\'s strings so fields show names', () => {
      const context = fakeContext(data());
      const set = vi.fn();
      (context.systems as any).l10n = { localeCode: 'en-GB', _store: { set } };

      new Rapid3LevelTools(context);

      expect(set).toHaveBeenCalledWith(['en', 'tagging', 'presets', 'fields', 'level_id', 'options', 'L1'], 'Concourse (L1)');
      expect(set).toHaveBeenCalledWith(['en-GB', 'tagging', 'presets', 'fields', 'parent_station', 'options', 'CENTRAL'], 'Central (CENTRAL)');
      expect(set).toHaveBeenCalledWith(['en', 'tagging', 'presets', 'fields', 'parent_station', 'options', 'P1'], 'Platform 1 (P1)');
    });
  });

  describe('stations without a stop_id', () => {
    const data = () => [
      node('s1', { location_type: '1', stop_name: 'Central' }), // no stop_id yet
      node('e1', { location_type: '2' })
    ];

    it('offers them as a parent_station under a suggested stop_id', () => {
      const tools = new Rapid3LevelTools(fakeContext(data()));
      expect(tools.referenceChoices('parent_station', 'e1')).toEqual([
        { value: 'STN_CENTRAL', label: 'Central (new stop_id STN_CENTRAL)' }
      ]);
    });

    it('gives the station that stop_id when a stop picks it, in the same undo step', () => {
      const context = fakeContext(data());
      (context as any).selectedIDs = () => ['e1'];
      new Rapid3LevelTools(context);

      // The user picks "Central" for the entrance's parent_station.
      context.local.set('e1', { ...context.graph.hasEntity('e1')!, tags: { location_type: '2', parent_station: 'STN_CENTRAL' } });
      context.systems.editor.emit('stablechange');

      expect(context.graph.hasEntity('s1')!.tags).toEqual({ location_type: '1', stop_name: 'Central', stop_id: 'STN_CENTRAL' });
      expect(context.systems.editor.commitAppend).toHaveBeenCalledWith({ annotation: 'Changed tags', selectedIDs: ['e1'] });
      expect(context.systems.editor.commit).not.toHaveBeenCalled();

      // Nothing more to write after that.
      context.systems.editor.emit('stablechange');
      expect(context.systems.editor.commitAppend).toHaveBeenCalledTimes(1);
    });

    it('writes nothing while no stop uses the suggestion', () => {
      const context = fakeContext(data());
      new Rapid3LevelTools(context);

      context.systems.editor.emit('stablechange');

      expect(context.systems.editor.perform).not.toHaveBeenCalled();
      expect(context.graph.hasEntity('s1')!.tags!.stop_id).toBeUndefined();
    });
  });

  describe('outlining levels', () => {
    const at = (entity: Entity, loc: [number, number]) => ({ ...entity, loc });
    const data = () => [
      ...station(), // L0 and L1 drawn
      at(node('r1', { level_id: 'ROOF', stop_name: 'Roof A' }), [-122.300, 47.600]),
      at(node('r2', { level_id: 'ROOF', stop_name: 'Roof B' }), [-122.299, 47.601]),
      at(node('m1', { level_id: 'MEZ', stop_name: 'Mezzanine' }), [-122.3, 47.6])
    ];

    it('boxes a level\'s stops in a new outline, stacked on top, and selects it', () => {
      const context = fakeContext(data());
      const tools = new Rapid3LevelTools(context);

      const [wayId] = tools.outlineLevels(['ROOF']);

      const outline = context.graph.hasEntity(wayId!)!;
      expect(outline.tags).toEqual({ area: 'yes', level_id: 'ROOF', level_index: '1' });
      expect(outline.nodes).toHaveLength(5);
      expect(outline.nodes![0]).toBe(outline.nodes![4]); // closed
      const corners = outline.nodes!.slice(0, 4).map(id => context.graph.hasEntity(id)!.loc!);
      expect(Math.min(...corners.map(([lon]) => lon))).toBeLessThan(-122.300);
      expect(Math.max(...corners.map(([, lat]) => lat))).toBeGreaterThan(47.601);

      expect(context.systems.editor.commit).toHaveBeenCalledWith({ annotation: 'Outlined level ROOF', selectedIDs: [wayId] });
      expect(context.enter).toHaveBeenCalledWith('select-osm', { selection: { osm: [wayId] } });
      expect(tools.levels.value.find(level => level.levelId === 'ROOF')!.areaIds).toEqual([wayId]);
    });

    it('outlines several levels in one edit, each with its own index', () => {
      const context = fakeContext(data());
      const tools = new Rapid3LevelTools(context);

      const wayIds = tools.outlineLevels(['MEZ', 'ROOF']);

      expect(wayIds).toHaveLength(2);
      expect(wayIds.map(id => context.graph.hasEntity(id)!.tags!.level_index)).toEqual(['1', '2']);
      expect(context.systems.editor.perform).toHaveBeenCalledTimes(1);
      expect(context.systems.editor.commit).toHaveBeenCalledWith({ annotation: 'Outlined 2 levels', selectedIDs: wayIds });
      expect(context.enter).not.toHaveBeenCalled();
    });

    it('skips levels that already have an outline or aren\'t known', () => {
      const context = fakeContext(data());
      const tools = new Rapid3LevelTools(context);

      expect(tools.outlineLevels(['L0', 'NOPE'])).toEqual([]);
      expect(context.systems.editor.perform).not.toHaveBeenCalled();
    });
  });

  describe('fading far ends of connections', () => {
    // L0 platform n1 --elevator w9-- n2 on L1: on L0, n2 is drawn only as the far end.
    const data = () => [...station(), way('w9', ['n1', 'n2'], { pathway_mode: '5' })];

    function fakeOsmLayer() {
      class PixiLayerOsm {
        features = new Map<string, any>();
        render() {}
      }
      (globalThis as any).Rapid.PixiLayerOsm = PixiLayerOsm;
      const layer = new PixiLayerOsm();
      for (const id of ['n1', 'n2', 'n3']) {
        layer.features.set(`osm-${id}`, { type: 'Point', data: { id }, container: { alpha: 1 } });
      }
      layer.features.set('osm-w9', { type: 'Line', data: { id: 'w9' }, container: { alpha: 1 } });
      return layer;
    }
    const alphas = (layer: any) => Object.fromEntries([...layer.features.values()].map((f: any) => [f.data.id, f.container.alpha]));

    it('fades stops outside the shown level, and restores them', () => {
      const layer = fakeOsmLayer();
      const tools = new Rapid3LevelTools(fakeContext(data()));

      layer.render();
      expect(alphas(layer)).toEqual({ n1: 1, n2: 1, n3: 1, w9: 1 }); // everything shown

      tools.showLevel('L0');
      layer.render();
      // n2 is on L1; n3 (an entrance with no level) isn't outside; lines aren't faded.
      expect(alphas(layer)).toEqual({ n1: 1, n2: FAR_END_ALPHA, n3: 1, w9: 1 });

      tools.showView(undefined);
      layer.render();
      expect(alphas(layer)).toEqual({ n1: 1, n2: 1, n3: 1, w9: 1 });
    });

    it('leaves opacity it didn\'t set alone', () => {
      const layer = fakeOsmLayer();
      new Rapid3LevelTools(fakeContext(data()));
      layer.features.get('osm-n1').container.alpha = 0.5; // set by Rapid

      layer.render();

      expect(layer.features.get('osm-n1').container.alpha).toBe(0.5);
    });
  });

  describe('selecting level outlines', () => {
    it('selects a level\'s outline without moving the map', () => {
      const context = fakeContext(station());
      const tools = new Rapid3LevelTools(context);

      tools.selectLevelOutline('L0');

      expect(context.enter).toHaveBeenCalledWith('select-osm', { selection: { osm: ['a0'] } });
      expect(context.systems.map.fitEntitiesEase).not.toHaveBeenCalled();
    });

    it('does nothing for a level without an outline', () => {
      const context = fakeContext([...station(), node('n9', { level_id: 'ROOF', stop_name: 'Roof' })]);
      new Rapid3LevelTools(context).selectLevelOutline('ROOF');

      expect(context.enter).not.toHaveBeenCalled();
    });

    it('deselects only when level outlines are what\'s selected', () => {
      const context = fakeContext(station());
      const tools = new Rapid3LevelTools(context);

      (context as any).selectedIDs = () => ['n1'];
      tools.selectLevelOutline();
      expect(context.enter).not.toHaveBeenCalled();

      (context as any).selectedIDs = () => ['a0'];
      tools.selectLevelOutline();
      expect(context.enter).toHaveBeenCalledWith('browse');
    });
  });
});

describe('changedStopLevels', () => {
  const stop = (id: string, levelId?: string, extra: Record<string, string> = {}) =>
    node(id, { location_type: '3', ...(levelId ? { level_id: levelId } : {}), ...extra });
  const levels = (changes: [string, { base?: Entity; head?: Entity }][]) =>
    [...changedStopLevels({ changes: new Map(changes) })].sort();

  it('lists the levels stops moved on or off, before and after', () => {
    expect(levels([['n1', { base: stop('n1', 'L0'), head: stop('n1', 'L1') }]])).toEqual(['L0', 'L1']);
    expect(levels([['n2', { base: undefined, head: stop('n2', 'L2') }]])).toEqual(['L2']); // added
    expect(levels([['n3', { base: stop('n3', 'L3'), head: undefined }]])).toEqual(['L3']); // deleted
    expect(levels([['n4', { base: stop('n4'), head: stop('n4', 'L4') }]])).toEqual(['L4']); // level set
  });

  it('ignores edits that keep a stop on its level, and features that aren\'t stops', () => {
    expect(levels([['n1', { base: stop('n1', 'L0'), head: stop('n1', 'L0', { stop_name: 'x' }) }]])).toEqual([]);
    expect(levels([['c1', { base: node('c1'), head: undefined }]])).toEqual([]);
    expect(levels([['w1', { base: way('w1', ['a', 'b'], { level_id: 'L0' }), head: undefined }]])).toEqual([]);
    expect([...changedStopLevels(undefined)]).toEqual([]);
  });
});
