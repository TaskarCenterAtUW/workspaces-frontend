import { describe, expect, it } from 'vitest';
import { connectivityProblems } from '~/services/gtfs-connectivity';
import type { LevelEntity } from '~/services/pathways-levels';

const node = (id: string, tags?: Record<string, string>): LevelEntity => ({ id, type: 'node', ...(tags ? { tags } : {}) });
const pathway = (id: string, from: string, to: string, mode: string, twoWay = true, extra: Record<string, string> = {}): LevelEntity =>
  ({ id, type: 'way', nodes: [from, to], tags: { pathway_mode: mode, is_bidirectional: twoWay ? '1' : '0', ...extra } });
const stop = (id: string, type: string, levelId?: string) =>
  node(id, { location_type: type, parent_station: 'S', ...(levelId ? { level_id: levelId } : {}) });

/** Problems as [feature, subtype, severity], sorted. */
function found(entities: LevelEntity[]) {
  return [...connectivityProblems(entities)]
    .flatMap(([id, problems]) => problems.map(problem => [id, problem.subtype, problem.severity]))
    .sort((a, b) => String(a).localeCompare(String(b)));
}

const station = node('s', { location_type: '1', stop_id: 'S', stop_name: 'Central' });

describe('connectivityProblems', () => {
  it('finds nothing wrong with a station whose platforms have step-free and stepped routes in and out', () => {
    expect(found([
      station,
      stop('e', '2', 'L0'), stop('n', '3', 'L0'), stop('p', '0', 'L1'),
      pathway('w1', 'e', 'n', '1'),
      pathway('w2', 'n', 'p', '2'),
      pathway('w3', 'n', 'p', '5'),
      { id: 'a1', type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { level_id: 'L1', level_index: '-1' } }
    ])).toEqual([]);
  });

  it('flags platforms riders can\'t reach, or can\'t leave', () => {
    expect(found([
      station,
      stop('e', '2'), stop('n', '3'), stop('p1', '0'), stop('p2', '0'), stop('x', '3'), stop('p3', '0'),
      pathway('w1', 'e', 'n', '1'),
      pathway('w2', 'n', 'p1', '1', false), // one-way in: no way back
      pathway('w3', 'x', 'p2', '1'), // p2's area doesn't connect to the entrance
      pathway('w4', 'p3', 'n', '1', false) // one-way out: can't get in
    ])).toEqual([
      ['p1', 'no_way_out', 'warning'],
      ['p2', 'unreachable', 'warning'],
      ['p3', 'unreachable', 'warning'],
      ['x', 'dead_end', 'warning'] // (only one pathway reaches it)
    ]);
  });

  it('suggests a step-free route, or an alternative to an elevator', () => {
    expect(found([
      station,
      stop('e', '2'), stop('p1', '0'), stop('p2', '0'), stop('b', '4'),
      pathway('w1', 'e', 'p1', '2'), // stairs only
      pathway('w2', 'e', 'p2', '5'), // elevator only
      pathway('w3', 'p2', 'b', '1')
    ])).toEqual([
      ['b', 'elevator_only', 'suggestion'],
      ['p1', 'no_step_free', 'suggestion'],
      ['p2', 'elevator_only', 'suggestion']
    ]);
  });

  it('flags a station with stops but no entrance', () => {
    expect(found([station, stop('n', '3'), stop('p', '0'), pathway('w1', 'n', 'p', '1')]))
      .toContainEqual(['s', 'no_entrance', 'warning']);
  });

  it('flags a level only if no station\'s entrances reach any stop on it', () => {
    const level = (id: string, levelId: string): LevelEntity =>
      ({ id, type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { level_id: levelId, level_index: '0' } });
    const problems = found([
      station,
      stop('e', '2', 'L0'), stop('p', '0', 'L0'), stop('q', '0', 'L2'), stop('r', '3', 'L2'),
      pathway('w1', 'e', 'p', '1'),
      pathway('w2', 'q', 'r', '1'), // L2's stops connect only to each other
      level('a0', 'L0'), level('a2', 'L2')
    ]);
    expect(problems).toContainEqual(['a2', 'level_unreachable', 'warning']);
    expect(problems.filter(([id]) => id === 'a0')).toEqual([]);
  });

  it('flags stops no pathway touches, but not stations or untagged nodes', () => {
    expect(found([station, stop('e', '2'), stop('p', '0'), node('bare')]))
      .toEqual([['e', 'isolated', 'warning'], ['p', 'isolated', 'warning']]); // not also "unreachable"
  });

  it('flags pathway settings that are likely mistakes', () => {
    expect(found([
      station,
      stop('e', '2', 'L0'), stop('a', '3', 'L0'), stop('b', '3', 'L0'), stop('c', '3', 'L1'),
      pathway('w1', 'e', 'a', '1'),
      pathway('w2', 'a', 'b', '5'), // elevator on one level
      pathway('w3', 'a', 'c', '4', true), // two-way escalator
      pathway('w4', 'b', 'e', '7', true) // two-way exit gate
    ])).toEqual([
      ['c', 'dead_end', 'warning'], // (only the escalator reaches it)
      ['w2', 'same_level', 'warning'],
      ['w3', 'escalator_two_way', 'suggestion'],
      ['w4', 'exit_gate_two_way', 'warning']
    ]);
  });

  it('flags pathways sharing a pathway_id', () => {
    const problems = connectivityProblems([
      station, stop('e', '2'), stop('a', '3'),
      pathway('w1', 'e', 'a', '1', true, { pathway_id: 'P1' }),
      pathway('w2', 'a', 'e', '2', true, { pathway_id: 'P1' }),
      pathway('w3', 'a', 'e', '5', true, { pathway_id: 'P3' })
    ]);
    expect(problems.get('w1')!.map(problem => problem.message)).toEqual(['pathway_id "P1" is also used by another pathway']);
    expect(problems.get('w2')!.map(problem => problem.subtype)).toEqual(['duplicate_pathway_id']);
    expect(problems.get('w3')).toBeUndefined();
  });

  /** Problems of the given subtypes only, as [feature, subtype]. */
  const only = (entities: LevelEntity[], ...subtypes: string[]) =>
    found(entities).filter(([, subtype]) => subtypes.includes(String(subtype))).map(([id, subtype]) => [id, subtype]);
  const at = (entity: LevelEntity, loc: [number, number]) => ({ ...entity, loc });

  it('flags generic nodes only one pathway reaches', () => {
    expect(only([
      station, stop('e', '2'), stop('a', '3'), stop('b', '3'), stop('p', '0'),
      pathway('w1', 'e', 'a', '1'), pathway('w2', 'a', 'p', '1'), pathway('w3', 'a', 'b', '1')
    ], 'dead_end')).toEqual([['b', 'dead_end']]); // a is a junction; p is a platform
  });

  it('flags the same two stops joined twice the same way, but not by different types or opposite one-way pathways', () => {
    expect(only([
      station, stop('e', '2'), stop('p', '0'),
      pathway('w1', 'e', 'p', '1'), pathway('w2', 'p', 'e', '1'), // two two-way walkways
      pathway('w3', 'e', 'p', '5'), // an elevator alongside
      pathway('w4', 'e', 'p', '4', false), pathway('w5', 'p', 'e', '4', false) // escalators up and down
    ], 'duplicate_pathway')).toEqual([['w1', 'duplicate_pathway'], ['w2', 'duplicate_pathway']]);
  });

  it('flags them only when they\'re drawn about the same length', () => {
    const ends = [at(stop('e', '2'), [0, 0]), at(stop('p', '0'), [0.001, 0])];
    const routes = [
      pathway('w1', 'e', 'p', '1'), // straight: ~111 m
      { id: 'w2', type: 'way', nodes: ['e', 'k1', 'p'], tags: { pathway_mode: '1', is_bidirectional: '1' } }, // ~114 m: a copy
      { id: 'w3', type: 'way', nodes: ['e', 'k2', 'p'], tags: { pathway_mode: '1', is_bidirectional: '1' } } // ~245 m: another route
    ];
    expect(only([
      station, ...ends, at(node('k1'), [0.0005, 0.0001]), at(node('k2'), [0.0005, 0.001]), ...routes
    ], 'duplicate_pathway')).toEqual([['w1', 'duplicate_pathway'], ['w2', 'duplicate_pathway']]);
  });

  it('suggests checking a length or traversal_time that doesn\'t fit the drawing', () => {
    // e to p is drawn about 111 m (0.001° of longitude at the equator).
    const ends = [at(stop('e', '2'), [0, 0]), at(stop('p', '0'), [0.001, 0])];
    const lengthOf = (length: string) => only([station, ...ends, pathway('w', 'e', 'p', '1', true, { length })], 'length_mismatch');
    expect(lengthOf('111')).toEqual([]);
    expect(lengthOf('80')).toEqual([]); // within half to double
    expect(lengthOf('20')).toEqual([['w', 'length_mismatch']]);
    expect(lengthOf('400')).toEqual([['w', 'length_mismatch']]);
    // Stairs aren't drawn at their real length.
    expect(only([station, ...ends, pathway('w', 'e', 'p', '2', true, { length: '20' })], 'length_mismatch')).toEqual([]);

    const timeOf = (traversal_time: string) => only([station, ...ends, pathway('w', 'e', 'p', '3', true, { traversal_time })], 'traversal_time_mismatch');
    expect(timeOf('120')).toEqual([]); // ~0.9 m/s
    expect(timeOf('5000')).toEqual([['w', 'traversal_time_mismatch']]); // ~0.02 m/s
    expect(timeOf('10')).toEqual([['w', 'traversal_time_mismatch']]); // ~11 m/s
  });

  it('flags a stair_count whose sign doesn\'t match going up or down', () => {
    const level = (id: string, levelId: string, index: string): LevelEntity =>
      ({ id, type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { level_id: levelId, level_index: index } });
    const stairs = (stair_count: string) => only([
      station, stop('e', '2', 'L0'), stop('p', '0', 'L1'), level('a0', 'L0', '0'), level('a1', 'L1', '-1'),
      pathway('w', 'e', 'p', '2', true, { stair_count })
    ], 'stair_count_direction');
    expect(stairs('-20')).toEqual([]); // down from L0 (0) to L1 (-1)
    expect(stairs('20')).toEqual([['w', 'stair_count_direction']]);
  });

  it('suggests checking a walkway that joins two levels, unless it has a max_slope (a ramp)', () => {
    const walk = (extra: Record<string, string> = {}) => only([
      station, stop('e', '2', 'L0'), stop('p', '0', 'L1'), pathway('w', 'e', 'p', '1', true, extra)
    ], 'walkway_changes_level');
    expect(walk()).toEqual([['w', 'walkway_changes_level']]);
    expect(walk({ max_slope: '0.08' })).toEqual([]);
  });

  it('flags a boarding area on a different level from its platform', () => {
    const platform = node('p', { location_type: '0', parent_station: 'S', stop_id: 'P1', level_id: 'L1' });
    const area = (levelId: string) => node('b', { location_type: '4', parent_station: 'P1', level_id: levelId });
    expect(only([station, platform, area('L2')], 'boarding_area_level')).toEqual([['b', 'boarding_area_level']]);
    expect(only([station, platform, area('L1')], 'boarding_area_level')).toEqual([]);
  });
});
