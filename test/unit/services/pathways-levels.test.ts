import { describe, expect, it } from 'vitest';
import {
  buildStationIndex,
  collectLevels,
  isHiddenInView,
  isHiddenOnLevel,
  isOutsideView,
  isLevelArea,
  isPathway,
  levelAreaIndex,
  levelAreasMissingId,
  levelBoxCorners,
  levelsByStation,
  levelsTopDown,
  nextLevelIndex,
  reorderedLevelIndexes,
  stopNodes,
  stopsByLevel,
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
  it('suggests L<index>, adding a suffix when it is taken', () => {
    expect(suggestLevelId(0, [])).toBe('L0');
    expect(suggestLevelId(-1, ['L0'])).toBe('L-1');
    expect(suggestLevelId(2, ['L2', 'L2-2'])).toBe('L2-3');
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
    expect(renumber([level('UP', 1), level('STREET', 0), level('N', 2), level('CONC', -1)]))
      .toEqual({ UP: 1, STREET: 0, N: -1, CONC: -2 });
  });

  it('keeps 0 on the ground level even when the ground level is the one moved', () => {
    expect(renumber([level('CONC', -1), level('STREET', 0)])).toEqual({ CONC: 1, STREET: 0 });
  });

  it('anchors on the level closest to 0 when none is at 0', () => {
    expect(renumber([level('A', 3), level('B', -2), level('C', 1.5)])).toEqual({ A: 3.5, B: 2.5, C: 1.5 });
  });

  it('makes the bottom level 0 when no level has a numeric index', () => {
    expect(renumber([level('A'), level('B')])).toEqual({ A: 1, B: 0 });
  });

  it('lists drawn levels highest first, then unknown indexes, then levels with no outline', () => {
    const levels = collectLevels([
      levelArea('w1', { level_id: 'STREET', level_index: '0' }),
      levelArea('w2', { level_id: 'UP', level_index: '1' }),
      levelArea('w3', { level_id: 'ODD', level_index: 'roof' }),
      levelArea('w4', { level_id: 'DOWN', level_index: '-1' }),
      node('n1', { level_id: 'LOST', stop_name: 'x' })
    ]);
    expect(levelsTopDown(levels).map(l => l.levelId)).toEqual(['UP', 'STREET', 'DOWN', 'ODD', 'LOST']);
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

  it('lists unlinked levels first, then each station\'s levels highest first, sharing levels', () => {
    expect(groupsOf(twoStations())).toEqual([
      [undefined, ['NEW']],
      ['Annex', ['STREET']],
      ['Central', ['STREET', 'CONC', 'PLAT']]
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
