import { describe, expect, it } from 'vitest';
import {
  collectLevels,
  isHiddenOnLevel,
  isLevelArea,
  isPathway,
  levelAreaIndex,
  levelAreasMissingId,
  nextLevelIndex,
  stopNodes,
  stopsByLevel,
  suggestLevelId,
  unleveledStops
} from '~/services/pathways-levels';
import type { LevelEntity } from '~/services/pathways-levels';

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
