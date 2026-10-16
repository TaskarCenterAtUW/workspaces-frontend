import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAR_END_ALPHA, LEVEL_FILTER_ID, Rapid3LevelTools } from '~/services/rapid3-levels';

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

  const listeners = new Map<string, (() => void)[]>();
  const editor = {
    staging: { graph },
    on: (event: string, fn: () => void) => listeners.set(event, [...(listeners.get(event) ?? []), fn]),
    perform: vi.fn((...actions: ((g: typeof graph) => void)[]) => actions.forEach(action => action(graph))),
    commit: vi.fn(),
    commitAppend: vi.fn(),
    getUndoAnnotation: () => 'Changed tags',
    /** Test helper: fires an editor event's listeners. */
    emit: (event: string) => (listeners.get(event) ?? []).forEach(fn => fn())
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
      .toEqual([[undefined, ['L0', 'L1']]]);
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

  it('renumbers level_index on every outline of each moved level, as one edit', () => {
    const context = fakeContext([
      ...station(),
      way('a0b', ['f1', 'f2', 'f3', 'f1'], { area: 'yes', level_id: 'L0', level_index: '0' }), // 2nd outline of L0
      way('a2', ['e1', 'e2', 'e3', 'e1'], { area: 'yes', level_id: 'UP', level_index: '1' }),
      node('n9', { level_id: 'ROOF', stop_name: 'Roof' }) // no outline: can't be reordered
    ]);
    const tools = new Rapid3LevelTools(context);

    // Move UP from the top to below the concourse; street stays 0.
    tools.reorderLevels(['L0', 'L1', 'UP', 'ROOF']);

    const index = (id: string) => context.graph.hasEntity(id)!.tags!.level_index;
    expect([index('a0'), index('a0b'), index('a1'), index('a2')]).toEqual(['0', '0', '-1', '-2']);
    expect(context.systems.editor.perform).toHaveBeenCalledTimes(1);
    expect(context.systems.editor.perform.mock.calls[0]).toHaveLength(1); // only UP changed
    expect(context.systems.editor.commit).toHaveBeenCalledWith({ annotation: 'Reordered levels', selectedIDs: [] });
    expect(tools.levels.value.map(level => [level.levelId, level.index])).toEqual([
      ['UP', -2], ['L1', -1], ['L0', 0], ['ROOF', undefined]
    ]);
  });

  it('makes no edit when the order is unchanged', () => {
    const context = fakeContext(station());
    const tools = new Rapid3LevelTools(context);

    tools.reorderLevels(['L0', 'L1']);

    expect(context.systems.editor.perform).not.toHaveBeenCalled();
    expect(context.systems.editor.commit).not.toHaveBeenCalled();
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
    const twoStations = () => [
      node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }),
      node('s2', { location_type: '1', stop_id: 'ANNEX', stop_name: 'Annex' }),
      node('e1', { location_type: '2', parent_station: 'CENTRAL' }),
      node('n1', { location_type: '3', parent_station: 'ANNEX', level_id: 'L1' }),
      way('a1', ['d1', 'd2', 'd3', 'd1'], { area: 'yes', level_id: 'L1', level_index: '-1' })
    ];

    function contextWithView(visibleIds: string[]) {
      const context = fakeContext(twoStations());
      const mapListeners: (() => void)[] = [];
      (context.systems.editor as any).intersects = () => visibleIds.map(id => context.graph.hasEntity(id));
      (context.systems.map as any).on = (event: string, fn: () => void) => {
        if (event === 'mapchange') mapListeners.push(fn);
      };
      return { context, moveMap: (ids: string[]) => {
        visibleIds.splice(0, visibleIds.length, ...ids);
        mapListeners.forEach(fn => fn());
      } };
    }

    it('lists the stations whose station, stops or level outlines are on screen', () => {
      const { context } = contextWithView(['e1']);
      const tools = new Rapid3LevelTools(context);
      expect([...tools.visibleStationIds.value!]).toEqual(['CENTRAL']);

      // Annex is in view through the outline of a level its node is on.
      const { context: other } = contextWithView(['a1']);
      expect([...new Rapid3LevelTools(other).visibleStationIds.value!]).toEqual(['ANNEX']);
    });

    it('updates as the map moves', () => {
      vi.useFakeTimers();
      try {
        const { context, moveMap } = contextWithView(['s1']);
        const tools = new Rapid3LevelTools(context);

        moveMap(['s2']);
        expect([...tools.visibleStationIds.value!]).toEqual(['CENTRAL']); // batched
        vi.advanceTimersByTime(150);
        expect([...tools.visibleStationIds.value!]).toEqual(['ANNEX']);
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

    it('offers drawn levels for level_id, highest first', () => {
      const tools = new Rapid3LevelTools(fakeContext(data()));
      expect(tools.referenceChoices('level_id')).toEqual([
        { value: 'L0', label: 'Street (L0)' },
        { value: 'L1', label: 'Concourse (L1)' }
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
        { value: 'CENTRAL', label: 'Central (new stop_id CENTRAL)' }
      ]);
    });

    it('gives the station that stop_id when a stop picks it, in the same undo step', () => {
      const context = fakeContext(data());
      (context as any).selectedIDs = () => ['e1'];
      new Rapid3LevelTools(context);

      // The user picks "Central" for the entrance's parent_station.
      context.local.set('e1', { ...context.graph.hasEntity('e1')!, tags: { location_type: '2', parent_station: 'CENTRAL' } });
      context.systems.editor.emit('stablechange');

      expect(context.graph.hasEntity('s1')!.tags).toEqual({ location_type: '1', stop_name: 'Central', stop_id: 'CENTRAL' });
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
});
