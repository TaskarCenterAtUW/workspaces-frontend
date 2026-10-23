import { describe, expect, it } from 'vitest';
import { levelProblems, pointInRing } from '~/services/gtfs-level-checks';
import type { LevelEntity } from '~/services/pathways-levels';

const node = (id: string, tags?: Record<string, string>): LevelEntity => ({ id, type: 'node', ...(tags ? { tags } : {}) });
const outline = (id: string, levelId: string, index: string): LevelEntity =>
  ({ id, type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { level_id: levelId, level_index: index } });

/** A station with a stop on each of the given levels, each outlined with its index. */
function station(code: string, levels: [string, string][]): LevelEntity[] {
  return [
    node(`s-${code}`, { location_type: '1', stop_id: `STN_${code}`, stop_name: code }),
    ...levels.flatMap(([levelId, index], i) => [
      node(`n-${code}-${i}`, { location_type: '3', parent_station: `STN_${code}`, level_id: levelId }),
      outline(`a-${code}-${i}`, levelId, index)
    ])
  ];
}
const orderProblems = (entities: LevelEntity[]) => [...levelProblems(entities, () => undefined)]
  .flatMap(([id, problems]) => problems.filter(p => p.subtype === 'station_level_order').map(p => [id, p.message, p.stationLevelIds]));

describe('station level order', () => {
  it('accepts levels numbered from street level, below-ground ones negative, with or without gaps', () => {
    expect(orderProblems([
      ...station('N06', [['N06_L1', '1'], ['N06_L0', '0'], ['N06_L2', '2']]),
      ...station('K01', [['K01_L0', '0']]),
      ...station('C', [['C_L1', '-1'], ['C_L2', '-2']]), // all below ground
      ...station('A', [['A_L0', '0'], ['A_L3', '-3']]), // a gap
      ...station('D', [['D_L1', '1']]) // no level at 0
    ])).toEqual([]);
  });

  it('flags levels numbered across the whole feed, lowest first', () => {
    expect(orderProblems(station('N12', [['N12_L0', '274'], ['N12_L1', '272'], ['N12_L2', '273']]))).toEqual([
      ['s-N12', 'Station N12\'s levels are numbered 272 to 274, far from street level (0)', ['N12_L1', 'N12_L2', 'N12_L0']]
    ]);
    expect(orderProblems(station('K', [['K_L0', '40']]))).toEqual([
      ['s-K', 'Station K\'s only level is numbered 40, far from street level (0)', ['K_L0']]
    ]);
  });

  it('flags levels sharing a number', () => {
    expect(orderProblems(station('B', [['B_L0', '0'], ['B_L1', '0'], ['B_L2', '-1']]))).toEqual([
      ['s-B', 'Station B has more than one level numbered 0', ['B_L2', 'B_L0', 'B_L1']]
    ]);
  });

  it('ignores stations with no indexed levels', () => {
    expect(orderProblems([node('s', { location_type: '1', stop_id: 'STN_X' }), node('n', { location_type: '3', parent_station: 'STN_X', level_id: 'X_L1' })]))
      .toEqual([]);
  });
});

describe('outside the level\'s outline', () => {
  type Loc = [number, number];
  const at = (entity: LevelEntity, loc: Loc) => ({ ...entity, loc });
  const box = (id: string, levelId: string, [w, s, e, n]: number[], prefix = id) => [
    { id, type: 'way', nodes: [`${prefix}1`, `${prefix}2`, `${prefix}3`, `${prefix}4`, `${prefix}1`], tags: { level_id: levelId, level_index: '0' } },
    at(node(`${prefix}1`), [w!, s!]), at(node(`${prefix}2`), [e!, s!]), at(node(`${prefix}3`), [e!, n!]), at(node(`${prefix}4`), [w!, n!])
  ];
  const stopOn = (id: string, levelId: string, loc: Loc) => at(node(id, { location_type: '3', level_id: levelId }), loc);
  const outside = (entities: (LevelEntity & { loc?: Loc })[]) => {
    const locs = new Map(entities.map(entity => [entity.id, entity.loc]));
    return [...levelProblems(entities, id => locs.get(id))]
      .flatMap(([id, problems]) => problems.filter(p => p.subtype === 'outside_level').map(p => [id, p.message, p.refitAreaId]));
  };

  it('tells whether a point is inside a ring', () => {
    const ring: Loc[] = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
    expect(pointInRing([1, 1], ring)).toBe(true);
    expect(pointInRing([3, 1], ring)).toBe(false);
  });

  it('counts a point on a ring\'s edge or corner as inside', () => {
    const ring: Loc[] = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
    expect(pointInRing([2, 1], ring)).toBe(true);
    expect(pointInRing([1, 0], ring)).toBe(true);
    expect(pointInRing([0, 2], ring)).toBe(true);
    expect(pointInRing([2.0001, 1], ring)).toBe(false);
  });

  it('flags a stop outside its level\'s outline, offering a refit for a single box', () => {
    expect(outside([
      ...box('a1', 'L1', [0, 0, 1, 1]),
      stopOn('in', 'L1', [0.5, 0.5]),
      stopOn('out', 'L1', [5, 5]),
      stopOn('nowhere', 'L9', [5, 5]) // L9 has no outline: flagged elsewhere
    ])).toEqual([['out', 'This generic node is outside level L1\'s outline', 'a1']]);
  });

  it('counts a stop inside any of its level\'s outlines, and offers no refit for several', () => {
    const entities = [...box('a1', 'L1', [0, 0, 1, 1]), ...box('a2', 'L1', [4, 4, 6, 6]), stopOn('far', 'L1', [5, 5]), stopOn('out', 'L1', [9, 9])];
    expect(outside(entities)).toEqual([['out', 'This generic node is outside level L1\'s outline', undefined]]);
  });

  it('flags a pathway on one level with a point outside its outline, but not one to another level', () => {
    const level0 = box('a0', 'L0', [0, 0, 1, 1]);
    const level1 = box('a1', 'L1', [0, 2, 1, 3], 'b');
    const stops = [stopOn('s0', 'L0', [0.5, 0.5]), stopOn('s0b', 'L0', [0.8, 0.8]), stopOn('s1', 'L1', [0.5, 2.5])];
    const pathway = (id: string, nodes: string[]) => ({ id, type: 'way', nodes, tags: { pathway_mode: '1' } });
    expect(outside([
      ...level0, ...level1, ...stops, at(node('bend'), [5, 0.5]), at(node('gap'), [0.5, 1.5]),
      pathway('inside', ['s0', 's0b']),
      pathway('stray', ['s0', 'bend', 's0b']),
      pathway('stairs', ['s0', 's1']),
      pathway('between', ['s0', 'gap', 's1']), // to another level: not checked, bend or not
      pathway('street', ['s0', 'bend', 'e0']) // to a stop with no level: not checked
    ].concat([at(node('e0', { location_type: '2' }), [5, 5])]))).toEqual([
      ['stray', 'Part of this pathway is outside level L0\'s outline', undefined]
    ]);
  });
});

describe('scoped as TDEI\'s validation checks them', () => {
  const subtypesOf = (entities: (LevelEntity & { loc?: [number, number] })[], subtype: string) =>
    [...levelProblems(entities, () => undefined)]
      .flatMap(([id, problems]) => problems.filter(p => p.subtype === subtype).map(() => id));

  it('flags a stop with no level_id only in a station that uses levels', () => {
    expect(subtypesOf([
      ...station('A', [['A_L0', '0']]),
      node('a-p', { location_type: '0', parent_station: 'STN_A' }), // A uses levels
      node('s-B', { location_type: '1', stop_id: 'STN_B', stop_name: 'B' }),
      node('b-p', { location_type: '0', parent_station: 'STN_B' }), // B doesn't
      node('loose', { location_type: '3' }) // in no station
    ], 'missing_level')).toEqual(['a-p']);
  });

  it('compares a stop with the rest of its level in its own station', () => {
    const at = (id: string, code: string, loc: [number, number]) =>
      ({ ...node(id, { location_type: '3', parent_station: `STN_${code}`, level_id: 'L0' }), loc });
    const stationNode = (code: string) => node(`s-${code}`, { location_type: '1', stop_id: `STN_${code}`, stop_name: code });
    // Two stations about 11 km apart share level L0; each one's stops are together.
    const entities = [
      stationNode('A'), at('a1', 'A', [0, 0]), at('a2', 'A', [0.0001, 0]), at('a3', 'A', [0, 0.0001]),
      stationNode('B'), at('b1', 'B', [0.1, 0]), at('b2', 'B', [0.1001, 0]), at('b3', 'B', [0.1, 0.0001]), at('b4', 'B', [0.1, 0.0002])
    ];
    expect(subtypesOf(entities, 'far_stop')).toEqual([]);
    expect(subtypesOf([...entities, at('a4', 'A', [0.01, 0])], 'far_stop')).toEqual(['a4']); // ~1.1 km from the rest of A
  });
});
