import { describe, expect, it } from 'vitest';
import {
  buildStationIndex,
  stationExtents,
  collectLevels,
  distanceMeters,
  farStops,
  highlightedStationIds,
  isHiddenInView,
  isHiddenOnLevel,
  isOutsideView,
  isLevelArea,
  isPathway,
  LARGE_LEVEL_METERS,
  OVERSIZED_LEVEL,
  largeLevelAreas,
  levelAreaIndex,
  levelAreasMissingId,
  levelBoxCorners,
  levelsByStation,
  levelsLowestFirst,
  nextLevelIndex,
  reorderedLevelIndexes,
  spanMeters,
  stopNodes,
  stopsByLevel,
  stationCode,
  stationStopIdBase,
  suggestLevelId,
  unleveledStops
} from '~/services/pathways-levels';
import type { Level, LevelEntity, LevelView } from '~/services/pathways-levels';

// A level is an area tagged level_id/level_index/level_name; stops reference it
// by level_id; pathways take their level(s) from their end stops.

const node = (id: string, tags?: Record<string, string>): LevelEntity => ({ id, type: 'node', ...(tags ? { tags } : {}) });
const way = (id: string, nodes: string[], tags?: Record<string, string>): LevelEntity => ({ id, type: 'way', nodes, ...(tags ? { tags } : {}) });
const levelArea = (id: string, tags: Record<string, string>, corners = [`${id}a`, `${id}b`, `${id}c`, `${id}a`]) =>
  way(id, corners, { area: 'yes', ...tags });

const ids = (entities: LevelEntity[]) => entities.map(entity => entity.id);

describe('level areas, pathways and stops', () => {
  it('treats ways with level_index as level areas, not pathways', () => {
    const area = levelArea('w1', { level_id: 'L1', level_index: '0' });
    expect(isLevelArea(area)).toBe(true);
    expect(isPathway(area)).toBe(false);
    expect(isPathway(way('w2', ['n1', 'n2'], { pathway_mode: '1' }))).toBe(true);
    expect(isPathway(way('w3', ['n1']))).toBe(false);
  });

  it('treats a closed area with a level_id but no level_index as a level area, not a pathway', () => {
    const outline = way('w1', ['n1', 'n2', 'n3', 'n1'], { area: 'yes', level_id: 'L1' });
    expect(isLevelArea(outline)).toBe(true);
    expect(isPathway(outline)).toBe(false);
    expect(isLevelArea(way('w2', ['n1', 'n2', 'n3', 'n1'], { area: 'yes' }))).toBe(false); // no level_id
    expect(isLevelArea(way('w3', ['n1', 'n2', 'n3'], { area: 'yes', level_id: 'L1' }))).toBe(false); // not closed
  });

  it('counts pathway ends and tagged nodes as stops, but not untagged geometry', () => {
    const entities = [
      node('n1'), node('n2'), node('n3'), // n2 is a bend
      way('w1', ['n1', 'n2', 'n3']),
      node('n4', { stop_name: 'Lonely platform' }),
      levelArea('w2', { level_id: 'L1', level_index: '0' }, ['c1', 'c2', 'c3', 'c1']),
      node('c1'), node('c2'), node('c3')
    ];
    expect(ids(stopNodes(entities))).toEqual(['n1', 'n3', 'n4']);
  });
});

describe('collectLevels', () => {
  it('lists drawn levels by level_index, plus level_ids only stops use, last', () => {
    const levels = collectLevels([
      levelArea('w1', { level_id: 'STREET', level_index: '0', level_name: 'Street' }),
      levelArea('w2', { level_id: 'MEZ', level_index: '-1', level_name: 'Mezzanine' }),
      levelArea('w3', { level_id: 'PLAT', level_index: '-2.5' }),
      node('n1', { level_id: 'ROOF', stop_name: 'x' })
    ]);

    expect(levels.map(level => [level.levelId, level.index, level.name])).toEqual([
      ['PLAT', -2.5, ''],
      ['MEZ', -1, 'Mezzanine'],
      ['STREET', 0, 'Street'],
      ['ROOF', undefined, '']
    ]);
    expect(levels.at(-1)!.areaIds).toEqual([]);
  });

  it('merges areas that share a level_id and skips areas without one', () => {
    const levels = collectLevels([
      levelArea('w1', { level_id: 'L1', level_index: '1' }),
      levelArea('w2', { level_id: 'L1', level_index: '1', level_name: 'North wing' }),
      levelArea('w3', { level_index: '2' })
    ]);

    expect(levels).toEqual([{ levelId: 'L1', index: 1, name: 'North wing', areaIds: ['w1', 'w2'] }]);
    expect(ids(levelAreasMissingId([levelArea('w3', { level_index: '2' })]))).toEqual(['w3']);
  });

  it('sorts a non-numeric level_index last', () => {
    const levels = collectLevels([
      levelArea('w1', { level_id: 'A', level_index: 'upper' }),
      levelArea('w2', { level_id: 'B', level_index: '3' })
    ]);
    expect(levels.map(level => level.levelId)).toEqual(['B', 'A']);
  });
});

describe('unleveled stops', () => {
  it('flags stops without a level_id, except stations and entrances', () => {
    const entities = [
      node('n1', { location_type: '0', stop_name: 'P1' }),
      node('n2', { location_type: '0', level_id: 'L1' }),
      node('n3', { location_type: '1', stop_name: 'Station' }),
      node('n4', { location_type: '2' }),
      node('n5', { location_type: '3', level_id: ' ' }),
      node('n6'), node('n7'),
      way('w1', ['n6', 'n7'])
    ];
    expect(ids(unleveledStops(entities))).toEqual(['n1', 'n5', 'n6', 'n7']);
  });

  it('groups stops by level in level order, with unleveled stops last', () => {
    const groups = stopsByLevel([
      levelArea('w1', { level_id: 'UP', level_index: '1' }),
      levelArea('w2', { level_id: 'DOWN', level_index: '-1' }),
      node('n1', { level_id: 'UP' }),
      node('n2', { level_id: 'DOWN' }),
      node('n3', { stop_name: 'Somewhere' })
    ]);
    expect(groups.map(group => [group.level?.levelId, ids(group.stops)])).toEqual([
      ['DOWN', ['n2']],
      ['UP', ['n1']],
      [undefined, ['n3']]
    ]);
  });
});

describe('isHiddenOnLevel', () => {
  // L0 platform n1 --walkway w1-- n2 L0 node --elevator w2-- n3 L1 node --walkway w3-- n4 L1
  // plus an unleveled stop n5, a bend b1 on w3, and level boxes for L0/L1.
  const entities = [
    node('n1', { level_id: 'L0', location_type: '0' }),
    node('n2', { level_id: 'L0', location_type: '3' }),
    node('n3', { level_id: 'L1', location_type: '3' }),
    node('n4', { level_id: 'L1', location_type: '0' }),
    node('n5', { location_type: '0', stop_name: 'Unleveled' }),
    node('b1'),
    way('w1', ['n1', 'n2'], { pathway_mode: '1' }),
    way('w2', ['n2', 'n3'], { pathway_mode: '5' }),
    way('w3', ['n3', 'b1', 'n4'], { pathway_mode: '1' }),
    levelArea('a0', { level_id: 'L0', level_index: '0' }, ['c1', 'c2', 'c3', 'c1']),
    levelArea('a1', { level_id: 'L1', level_index: '1' }, ['d1', 'd2', 'd3', 'd1']),
    node('c1'), node('c2'), node('c3'), node('d1'), node('d2'), node('d3')
  ];
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const parentWays = (n: LevelEntity) => entities.filter(e => e.type === 'way' && e.nodes!.includes(n.id));
  const hidden = (levelId: string) => entities
    .filter(entity => isHiddenOnLevel(entity, levelId, id => byId.get(id), parentWays))
    .map(entity => entity.id)
    .sort();

  it('on L0, hides L1 stops, pathways and box, but keeps the elevator and its far end', () => {
    expect(hidden('L0')).toEqual(['a1', 'b1', 'd1', 'd2', 'd3', 'n4', 'w3']);
  });

  it('on L1, shows the elevator from the other side too', () => {
    expect(hidden('L1')).toEqual(['a0', 'c1', 'c2', 'c3', 'n1', 'w1']);
  });

  it('keeps unleveled stops and pathways between unleveled stops visible on every level', () => {
    const extra = [node('u1', { stop_name: 'A' }), node('u2', { stop_name: 'B' }), way('wu', ['u1', 'u2'])];
    const lookup = new Map(extra.map(entity => [entity.id, entity]));
    for (const entity of extra) {
      expect(isHiddenOnLevel(entity, 'L0', id => lookup.get(id), () => []), String(entity.id)).toBe(false);
    }
    expect(hidden('L0')).not.toContain('n5');
  });
});

describe('generated level IDs', () => {
  it('suggests L<index> for a level with no station, adding a suffix when it is taken', () => {
    expect(suggestLevelId(0, [])).toBe('L0');
    expect(suggestLevelId(-1, ['L0'])).toBe('L-1');
    expect(suggestLevelId(2, ['L2', 'L2-2'])).toBe('L2-3');
  });

  it('prefixes the codes of the level\'s stations, joined by "_"', () => {
    expect(suggestLevelId(0, [], ['STN_J02'])).toBe('J02_L0');
    expect(suggestLevelId(-1, [], ['STN_K01', 'STN_J02', 'STN_J02'])).toBe('J02_K01_L-1'); // sorted, once each
    expect(suggestLevelId(0, ['J02_L0'], ['STN_J02'])).toBe('J02_L0-2');
    expect(suggestLevelId(1, [], ['CENTRAL'])).toBe('CENTRAL_L1'); // a stop_id without STN_ is its own code
  });

  it('builds station stop_ids as STN_<code>', () => {
    expect(stationCode('STN_J02')).toBe('J02');
    expect(stationCode('J02')).toBe('J02');
    expect(stationStopIdBase({ stop_code: 'j02', stop_name: 'Van Dorn St' })).toBe('STN_J02');
    expect(stationStopIdBase({ stop_name: 'Van Dorn St.' })).toBe('STN_VAN_DORN_ST');
    expect(stationStopIdBase({})).toBe('STN_STATION');
  });

  it('puts the next level one above the highest index, or at 0', () => {
    const levels = collectLevels([
      levelArea('w1', { level_id: 'A', level_index: '-2' }),
      levelArea('w2', { level_id: 'B', level_index: '1.5' }),
      levelArea('w3', { level_id: 'C', level_index: 'roof' })
    ]);
    expect(nextLevelIndex(levels)).toBe(2);
    expect(nextLevelIndex([])).toBe(0);
  });

  it('reads a level area index only when it is numeric', () => {
    expect(levelAreaIndex(levelArea('w1', { level_index: '-1' }))).toBe(-1);
    expect(levelAreaIndex(levelArea('w2', { level_index: 'roof' }))).toBeUndefined();
  });
});

describe('reordering levels', () => {
  const level = (levelId: string, index?: number, drawn = true): Level =>
    ({ levelId, index, name: '', areaIds: drawn ? [`a-${levelId}`] : [] });
  const renumber = (order: Level[]) => Object.fromEntries(reorderedLevelIndexes(order));

  it('keeps the ground level at 0 and numbers the rest by distance from it', () => {
    // New level N (index 2) dragged to just below Street.
    expect(renumber([level('CONC', -1), level('N', 2), level('STREET', 0), level('UP', 1)]))
      .toEqual({ UP: 1, STREET: 0, N: -1, CONC: -2 });
  });

  it('keeps 0 on the ground level even when the ground level is the one moved', () => {
    expect(renumber([level('STREET', 0), level('CONC', -1)])).toEqual({ CONC: 1, STREET: 0 });
  });

  it('anchors on the level closest to 0 when none is at 0', () => {
    expect(renumber([level('C', 1.5), level('B', -2), level('A', 3)])).toEqual({ A: 3.5, B: 2.5, C: 1.5 });
  });

  it('makes the lowest level 0 when no level has a numeric index', () => {
    expect(renumber([level('B'), level('A')])).toEqual({ A: 1, B: 0 });
  });

  it('lists drawn levels lowest first, then unknown indexes, then levels with no outline', () => {
    const levels = collectLevels([
      levelArea('w1', { level_id: 'STREET', level_index: '0' }),
      levelArea('w2', { level_id: 'UP', level_index: '1' }),
      levelArea('w3', { level_id: 'ODD', level_index: 'roof' }),
      levelArea('w4', { level_id: 'DOWN', level_index: '-1' }),
      node('n1', { level_id: 'LOST', stop_name: 'x' })
    ]);
    expect(levelsLowestFirst(levels).map(l => l.levelId)).toEqual(['DOWN', 'STREET', 'UP', 'ODD', 'LOST']);
  });
});

describe('levelsByStation', () => {
  const groupsOf = (entities: LevelEntity[]) => levelsByStation(entities)
    .map(group => [group.station?.name, group.levels.map(level => level.levelId)]);

  // Two stations sharing a street level; Central also has a concourse and a
  // platform level reached only by a boarding area (-> platform -> station).
  const twoStations = () => [
    node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }),
    node('s2', { location_type: '1', stop_id: 'ANNEX', stop_name: 'Annex' }),
    levelArea('w1', { level_id: 'STREET', level_index: '0' }),
    levelArea('w2', { level_id: 'CONC', level_index: '-1' }),
    levelArea('w3', { level_id: 'PLAT', level_index: '-2' }),
    levelArea('w4', { level_id: 'NEW', level_index: '5' }), // no stops yet
    node('e1', { location_type: '2', parent_station: 'CENTRAL', level_id: 'STREET' }),
    node('e2', { location_type: '2', parent_station: 'ANNEX', level_id: 'STREET' }),
    node('n1', { location_type: '3', parent_station: 'CENTRAL', level_id: 'CONC' }),
    node('p1', { location_type: '0', parent_station: 'CENTRAL', stop_id: 'P1' }),
    node('b1', { location_type: '4', parent_station: 'P1', level_id: 'PLAT' })
  ];

  it('lists unlinked levels first, then each station\'s levels lowest first, sharing levels', () => {
    expect(groupsOf(twoStations())).toEqual([
      [undefined, ['NEW']],
      ['Annex', ['STREET']],
      ['Central', ['PLAT', 'CONC', 'STREET']]
    ]);
  });

  it('includes stations with no levels yet, and an empty no-station group', () => {
    expect(groupsOf([
      node('s1', { location_type: '1', stop_id: 'S1', stop_name: 'Solo' }),
      node('e1', { location_type: '2', parent_station: 'S1' })
    ])).toEqual([[undefined, []], ['Solo', []]]);
  });

  it('identifies stations by stop_id', () => {
    const [, annex] = levelsByStation(twoStations());
    expect(annex!.station).toEqual({ id: 's2', stopId: 'ANNEX', name: 'Annex' });
  });

  it('ignores parent_station values that are not stations', () => {
    expect(groupsOf([
      node('p1', { location_type: '0', stop_id: 'P1' }),
      node('n1', { location_type: '3', parent_station: 'P1', level_id: 'L1' }),
      node('n2', { location_type: '3', parent_station: 'MISSING', level_id: 'L2' })
    ])).toEqual([[undefined, ['L1', 'L2']]]);
  });

  it('returns a single unnamed group when there are no stations', () => {
    expect(groupsOf([levelArea('w1', { level_id: 'L0', level_index: '0' })])).toEqual([[undefined, ['L0']]]);
    expect(groupsOf([])).toEqual([[undefined, []]]);
  });
});

describe('isHiddenInView (station views)', () => {
  // Central: street entrance e1 (no level) --walkway w1-- node n1 on CONC.
  // Annex: entrance e2 (no level). Loose stop x1 (no station) --w2-- x2 (no station).
  // Level boxes: CONC (Central), LOOSE (no station uses it).
  const entities = [
    node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }),
    node('s2', { location_type: '1', stop_id: 'ANNEX', stop_name: 'Annex' }),
    node('e1', { location_type: '2', parent_station: 'CENTRAL' }),
    node('n1', { location_type: '3', parent_station: 'CENTRAL', level_id: 'CONC' }),
    node('e2', { location_type: '2', parent_station: 'ANNEX' }),
    node('x1', { location_type: '0', stop_name: 'Loose', level_id: 'LOOSE' }),
    node('x2'),
    node('b1'),
    way('w1', ['e1', 'b1', 'n1'], { pathway_mode: '1' }),
    way('w2', ['x1', 'x2'], { pathway_mode: '1' }),
    levelArea('a1', { level_id: 'CONC', level_index: '-1' }, ['c1', 'c2', 'c3', 'c1']),
    levelArea('a2', { level_id: 'LOOSE', level_index: '0' }, ['d1', 'd2', 'd3', 'd1']),
    node('c1'), node('c2'), node('c3'), node('d1'), node('d2'), node('d3')
  ];
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const parentWays = (n: LevelEntity) => entities.filter(e => e.type === 'way' && e.nodes!.includes(n.id));
  const index = buildStationIndex(entities);
  const shown = (view: LevelView) => entities
    .filter(entity => !isHiddenInView(entity, view, id => byId.get(id), parentWays, index))
    .map(entity => entity.id)
    .sort();

  it('"No station" shows stops outside stations, their pathways, and levels no station uses', () => {
    expect(shown({ kind: 'noStation' })).toEqual(['a2', 'd1', 'd2', 'd3', 'w2', 'x1', 'x2']);
  });

  it('a station\'s "No level" shows the station, its unleveled stops and their pathways', () => {
    // n1 is on a level but stays visible as the far end of the walkway from e1.
    expect(shown({ kind: 'stationNoLevel', stationId: 'CENTRAL' })).toEqual(['b1', 'e1', 'n1', 's1', 'w1']);
    expect(shown({ kind: 'stationNoLevel', stationId: 'ANNEX' })).toEqual(['e2', 's2']);
  });

  it('defers to level filtering for level views', () => {
    expect(shown({ kind: 'level', levelId: 'CONC' })).toContain('n1');
    expect(shown({ kind: 'level', levelId: 'CONC' })).not.toContain('x1');
  });
});

describe('levelBoxCorners', () => {
  it('boxes points with padding, corners from south-west going counter-clockwise', () => {
    const [sw, se, ne, nw] = levelBoxCorners([[-122.30, 47.60], [-122.29, 47.61]], 10);
    const padLat = 10 / 111_320;
    expect(sw![1]).toBeCloseTo(47.60 - padLat, 9);
    expect(ne![1]).toBeCloseTo(47.61 + padLat, 9);
    expect(sw![0]).toBeLessThan(-122.30);
    expect(ne![0]).toBeGreaterThan(-122.29);
    expect([se![0], se![1], nw![0], nw![1]]).toEqual([ne![0], sw![1], sw![0], ne![1]]);
  });

  it('makes a square of about 2 x padding around a single point', () => {
    const [sw, , ne] = levelBoxCorners([[-122.3, 47.6]], 10);
    const metersNS = (ne![1] - sw![1]) * 111_320;
    const metersEW = (ne![0] - sw![0]) * 111_320 * Math.cos(47.6 * Math.PI / 180);
    expect(metersNS).toBeCloseTo(20, 6);
    expect(metersEW).toBeCloseTo(20, 6);
  });

  it('returns no corners for no points', () => {
    expect(levelBoxCorners([])).toEqual([]);
  });
});

describe('isOutsideView', () => {
  const entities = [
    node('s1', { location_type: '1', stop_id: 'CENTRAL' }),
    node('e1', { location_type: '2', parent_station: 'CENTRAL' }),
    node('n1', { location_type: '3', parent_station: 'CENTRAL', level_id: 'L1' }),
    node('x1', { stop_name: 'Loose', level_id: 'L0' }),
    node('u1')
  ];
  const index = buildStationIndex(entities);
  const outside = (view: LevelView) => entities.filter(e => isOutsideView(e, view, index)).map(e => e.id);

  it('on a level, is true for stops on other levels only', () => {
    expect(outside({ kind: 'level', levelId: 'L0' })).toEqual(['n1']);
  });

  it('for "No station", is true for stations and their stops', () => {
    expect(outside({ kind: 'noStation' })).toEqual(['s1', 'e1', 'n1']);
  });

  it('for a station\'s "Street / No level", is true for its leveled stops and anything else', () => {
    expect(outside({ kind: 'stationNoLevel', stationId: 'CENTRAL' })).toEqual(['n1', 'x1']);
  });
});

describe('large level outlines', () => {
  // ~0.001° of latitude is ~111 m.
  const locs: Record<string, [number, number]> = {
    sa: [0, 0], sb: [0.001, 0], sc: [0.001, 0.001], // small: ~111 m across
    ba: [0, 0], bb: [0.02, 0], bc: [0.02, 0.001], // big: ~2.2 km across
    ma: [0, 0], mb: [0.005, 0], mc: [0.005, 0.001] // ~557 m across
  };
  const locOf = (id: string | number) => locs[String(id)];

  it('measures the longer side of the box around some locations, in meters', () => {
    expect(spanMeters([])).toBe(0);
    expect(spanMeters([[0, 0], [0, 0.001]])).toBeCloseTo(111.3, 0);
    expect(spanMeters([[0, 0], [0.01, 0.001]])).toBeCloseTo(1113.2, 0);
    // A degree of longitude is shorter away from the equator.
    expect(spanMeters([[0, 60], [0.01, 60]])).toBeCloseTo(556.6, 0);
  });

  it('flags level outlines at least 500 m across, largest first', () => {
    expect(LARGE_LEVEL_METERS).toBe(500);
    const entities = [
      levelArea('w1', { level_id: 'SMALL', level_index: '0' }, ['sa', 'sb', 'sc', 'sa']),
      levelArea('w2', { level_id: 'MID', level_index: '1' }, ['ma', 'mb', 'mc', 'ma']),
      levelArea('w3', { level_id: 'BIG', level_index: '2' }, ['ba', 'bb', 'bc', 'ba']),
      way('p1', ['ba', 'bb'], { pathway_mode: '1' }) // a long pathway isn't a level
    ];
    expect(largeLevelAreas(entities, locOf).map(({ area, meters }) => [area.id, Math.round(meters)]))
      .toEqual([['w3', 2226], ['w2', 557]]);
    expect(largeLevelAreas(entities, locOf, 1000).map(({ area }) => area.id)).toEqual(['w3']);
  });

  it('also flags outlines much bigger than their level\'s stops need, at any size', () => {
    expect(OVERSIZED_LEVEL).toEqual({ ratio: 2, excessMeters: 100 });
    const stop = (id: string, levelId: string, loc: [number, number]) =>
      ({ ...node(id, { location_type: '3', level_id: levelId }), loc });
    const corners: Record<string, [number, number]> = {
      // ~334 m wide, around a STRAY level whose stops are ~11 m apart (~31 m boxed)
      ra: [0, 0], rb: [0.003, 0], rc: [0.003, 0.0001],
      // ~67 m wide, around a SNUG level whose stops are ~11 m apart: only ~36 m extra
      sa: [0, 0], sb: [0.0006, 0], sc: [0.0006, 0.0001],
      // ~612 m wide, around a WIDE level whose stops really span ~556 m
      wa: [0, 0], wb: [0.0055, 0], wc: [0.0055, 0.0001]
    };
    const entities = [
      levelArea('w1', { level_id: 'STRAY', level_index: '0' }, ['ra', 'rb', 'rc', 'ra']),
      levelArea('w2', { level_id: 'SNUG', level_index: '1' }, ['sa', 'sb', 'sc', 'sa']),
      levelArea('w3', { level_id: 'WIDE', level_index: '2' }, ['wa', 'wb', 'wc', 'wa']),
      stop('n1', 'STRAY', [0, 0]), stop('n2', 'STRAY', [0.0001, 0]),
      stop('n3', 'SNUG', [0, 0]), stop('n4', 'SNUG', [0.0001, 0]),
      stop('n5', 'WIDE', [0, 0]), stop('n6', 'WIDE', [0.005, 0])
    ];
    expect(largeLevelAreas(entities, id => corners[String(id)]).map(({ area, meters, stopsMeters, oversized }) =>
      [area.id, Math.round(meters), Math.round(stopsMeters!), oversized]))
      .toEqual([
        ['w3', 612, 577, false], // big, but its stops need it: flagged for size only
        ['w1', 334, 31, true] // under 500 m, but ~10x its stops
      ]);
  });

  it('ignores corners whose location isn\'t known', () => {
    const entities = [levelArea('w1', { level_id: 'X', level_index: '0' }, ['ba', 'missing', 'bc', 'ba'])];
    expect(largeLevelAreas(entities, locOf).map(({ area }) => area.id)).toEqual(['w1']);
    expect(largeLevelAreas([levelArea('w2', { level_id: 'Y', level_index: '0' }, ['q', 'r', 's', 'q'])], locOf)).toEqual([]);
  });
});

describe('stops far from their level', () => {
  const stopAt = (id: string, levelId: string, loc: [number, number]) =>
    ({ ...node(id, { location_type: '3', level_id: levelId }), loc });

  it('measures distances in meters', () => {
    expect(distanceMeters([0, 0], [0, 0.001])).toBeCloseTo(111.3, 0);
    expect(distanceMeters([0, 60], [0.002, 60])).toBeCloseTo(111.3, 0);
  });

  it('flags stops at least 500 m from the middle of their level, farthest first', () => {
    const entities = [
      stopAt('a', 'L0', [0, 0]), stopAt('b', 'L0', [0.0005, 0]), stopAt('c', 'L0', [0, 0.0005]),
      stopAt('stray', 'L0', [0.02, 0]), // ~2.2 km east
      stopAt('near', 'L0', [0.003, 0]), // ~334 m: fine
      stopAt('d', 'L1', [0, 0]), stopAt('e', 'L1', [0.0005, 0]), stopAt('f', 'L1', [0, 0.0005]),
      stopAt('lost', 'L1', [0, -0.006]) // ~668 m south
    ];
    expect(farStops(entities).map(({ stop, levelId, meters }) => [stop.id, levelId, Math.round(meters)]))
      .toEqual([['stray', 'L0', 2171], ['lost', 'L1', 668]]);
  });

  it('needs three located stops on a level to tell which is out of place', () => {
    expect(farStops([stopAt('a', 'L0', [0, 0]), stopAt('b', 'L0', [0.02, 0])])).toEqual([]);
    expect(farStops([stopAt('a', 'L0', [0, 0]), stopAt('b', 'L0', [0.0005, 0]), node('c', { location_type: '3', level_id: 'L0' })]))
      .toEqual([]);
  });
});

describe('highlightedStationIds', () => {
  const index = buildStationIndex([
    node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }),
    node('s2', { location_type: '1', stop_id: 'ANNEX', stop_name: 'Annex' }),
    node('e1', { location_type: '2', parent_station: 'CENTRAL', level_id: 'STREET' }),
    node('e2', { location_type: '2', parent_station: 'ANNEX', level_id: 'STREET' }),
    node('n1', { location_type: '3', parent_station: 'CENTRAL', level_id: 'CONC' })
  ]);
  const ids = (view: LevelView | undefined, selected: string[] = []) => [...highlightedStationIds(view, selected, index)].sort();

  it('highlights the station whose Street / No level view is shown', () => {
    expect(ids({ kind: 'stationNoLevel', stationId: 'CENTRAL' })).toEqual(['CENTRAL']);
  });

  it('highlights every station whose stops use the level shown', () => {
    expect(ids({ kind: 'level', levelId: 'CONC' })).toEqual(['CENTRAL']);
    expect(ids({ kind: 'level', levelId: 'STREET' })).toEqual(['ANNEX', 'CENTRAL']);
  });

  it('highlights a station selected in the editor, but not other selections', () => {
    expect(ids(undefined, ['s2'])).toEqual(['ANNEX']);
    expect(ids(undefined, ['e1', 'n1'])).toEqual([]);
    expect(ids({ kind: 'noStation' })).toEqual([]);
    expect(ids(undefined)).toEqual([]);
  });
});

describe('stationExtents', () => {
  const at = (entity: LevelEntity, loc: [number, number]) => ({ ...entity, loc });
  // Station S's stops are on level S_L1 (its own) and STREET (shared with station T).
  const entities = [
    at(node('s', { location_type: '1', stop_id: 'S', stop_name: 'S' }), [0, 0]),
    at(node('s1', { location_type: '0', stop_id: 'PF_S', parent_station: 'S', level_id: 'S_L1' }), [1, 1]),
    at(node('s2', { location_type: '2', stop_id: 'ENT_S', parent_station: 'S', level_id: 'STREET' }), [0, 1]),
    at(node('t', { location_type: '1', stop_id: 'T', stop_name: 'T' }), [10, 10]),
    at(node('t1', { location_type: '2', stop_id: 'ENT_T', parent_station: 'T', level_id: 'STREET' }), [10, 11]),
    // S_L1's outline reaches past S's stops; the shared street level's spans both stations.
    at(node('c1'), [-2, -1]), at(node('c2'), [3, -1]), at(node('c3'), [3, 2]),
    way('a1', ['c1', 'c2', 'c3', 'c1'], { area: 'yes', level_id: 'S_L1', level_index: '-1' }),
    at(node('d1'), [-5, -5]), at(node('d2'), [15, -5]), at(node('d3'), [15, 15]),
    way('a0', ['d1', 'd2', 'd3', 'd1'], { area: 'yes', level_id: 'STREET', level_index: '0' })
  ];

  it('covers a station\'s point, its stops and the outlines of levels only it uses, but not shared levels\' outlines', () => {
    const boxes = stationExtents(entities, buildStationIndex(entities));

    expect(boxes.get('S')).toEqual({ min: [-2, -1], max: [3, 2] });
    expect(boxes.get('T')).toEqual({ min: [10, 10], max: [10, 11] });
  });
});
