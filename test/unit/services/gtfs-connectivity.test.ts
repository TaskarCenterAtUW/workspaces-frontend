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
      pathway('w4', 'n', 'p', '1', true, { max_slope: '0.05' }), // a ramp, so not only the elevator is step-free
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
      ['p1', 'no_way_out', 'ERROR'],
      ['p2', 'unreachable', 'ERROR'],
      ['p3', 'unreachable', 'ERROR'],
      ['x', 'dead_end', 'WARNING'], // (only one pathway reaches it)
      ['x', 'unreachable', 'ERROR'] // generic nodes are checked too
    ]);
  });

  it('suggests a step-free route, or an alternative to an elevator', () => {
    expect(found([
      station,
      stop('e', '2'), stop('p1', '0'), stop('p2', '0'), stop('b', '4'), stop('p3', '0'), stop('p4', '0'),
      pathway('w1', 'e', 'p1', '2'), // stairs only
      pathway('w2', 'e', 'p2', '5'), // elevator only
      pathway('w3', 'p2', 'b', '1'),
      pathway('w4', 'e', 'p3', '3'), // moving sidewalk only: not step-free
      pathway('w5', 'e', 'p4', '2'), pathway('w6', 'e', 'p4', '5') // stairs, or the elevator step-free
    ]).filter(([, subtype]) => subtype !== 'elevator_end_no_level')).toEqual([
      ['b', 'elevator_only', 'INFO'],
      ['p1', 'no_step_free', 'INFO'],
      ['p2', 'elevator_only', 'INFO'],
      ['p3', 'no_step_free', 'INFO'],
      ['p4', 'elevator_only', 'INFO']
    ]);
  });

  it('flags a station with stops but no entrance', () => {
    expect(found([station, stop('n', '3'), stop('p', '0'), pathway('w1', 'n', 'p', '1')]))
      .toContainEqual(['s', 'no_entrance', 'ERROR']);
  });

  it('follows routes from any station\'s entrances, as TDEI\'s validation does', () => {
    const other = node('t', { location_type: '1', stop_id: 'T', stop_name: 'Annex' });
    const annex = (id: string, type: string) => node(id, { location_type: type, parent_station: 'T' });
    const problems = found([
      station, stop('e', '2'), stop('n', '3'), pathway('w1', 'e', 'n', '1'),
      other, annex('q', '0'), pathway('w2', 'n', 'q', '1') // T's platform is reached through S's entrance
    ]);
    expect(problems).toContainEqual(['t', 'no_entrance', 'ERROR']);
    expect(problems.filter(([id]) => id === 'q')).toEqual([]); // not unreachable
  });

  it('flags a level a station uses when none of its stops on it can be reached from an entrance', () => {
    const level = (id: string, levelId: string): LevelEntity =>
      ({ id, type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { level_id: levelId, level_index: '0' } });
    const problems = found([
      station,
      stop('e', '2', 'L0'), stop('p', '0', 'L0'), stop('q', '0', 'L2'), stop('r', '3', 'L2'),
      pathway('w1', 'e', 'p', '1'),
      pathway('w2', 'q', 'r', '1'), // L2's stops connect only to each other
      level('a0', 'L0'), level('a2', 'L2')
    ]);
    expect(problems).toContainEqual(['a2', 'level_unreachable', 'ERROR']);
    expect(connectivityProblems([
      station, stop('e', '2', 'L0'), stop('p', '0', 'L0'), stop('q', '0', 'L2'), stop('r', '3', 'L2'),
      pathway('w1', 'e', 'p', '1'), pathway('w2', 'q', 'r', '1'), level('a2', 'L2')
    ]).get('a2')!.map(problem => problem.message)).toEqual(['No stop on level L2 in Central can be reached from an entrance']);
    expect(problems.filter(([id]) => id === 'a0')).toEqual([]);
  });

  it('flags stops no pathway touches, but not stations or untagged nodes', () => {
    expect(found([station, stop('e', '2'), stop('n', '3'), stop('p', '0'), node('bare'), pathway('w1', 'e', 'n', '1')])
      .filter(([, subtype]) => subtype !== 'dead_end'))
      .toEqual([['p', 'isolated', 'WARNING']]); // not also "unreachable"
  });

  it('skips stations without pathways, as TDEI\'s validation does', () => {
    const other = node('t', { location_type: '1', stop_id: 'T', stop_name: 'Side St' });
    const street = (id: string, type: string) => node(id, { location_type: type, parent_station: 'T' });
    expect(found([station, stop('e', '2'), stop('p', '0'), pathway('w1', 'e', 'p', '1'), other, street('q', '0'), street('r', '0')]))
      .toEqual([]); // no "no entrance", "isolated" or "unreachable" for T's stops
  });

  it('flags pathway settings that are likely mistakes', () => {
    expect(found([
      station,
      stop('e', '2', 'L0'), stop('a', '3', 'L0'), stop('b', '3', 'L0'), stop('c', '3', 'L1'),
      pathway('w1', 'e', 'a', '1'),
      pathway('w2', 'a', 'b', '5'), // elevator on one level
      pathway('w3', 'a', 'c', '4', true), // two-way escalator: fine, it may be reversible
      pathway('w4', 'b', 'e', '7', true), // two-way exit gate
      pathway('w5', 'a', 'b', '2'), // stairs on one level
      pathway('w6', 'e', 'a', '2', true, { stair_count: '4' }) // a short flight within the level
    ])).toEqual([
      ['c', 'dead_end', 'WARNING'], // (only the escalator reaches it)
      ['w2', 'same_level', 'WARNING'],
      ['w4', 'exit_gate_two_way', 'ERROR'],
      ['w5', 'same_level', 'WARNING'],
      ['w6', 'stairs_short_within_level', 'INFO'] // reported, as a suggestion
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
    ], 'duplicate_pathway')).toEqual([['w2', 'duplicate_pathway']]); // the second, as a duplicate of the first
  });

  it('flags them only when their lengths are within 10%, or one has none', () => {
    expect(only([
      station, stop('e', '2'), stop('p', '0'),
      pathway('w1', 'e', 'p', '1', true, { length: '111' }),
      pathway('w2', 'e', 'p', '1', true, { length: '114' }), // a copy
      pathway('w3', 'e', 'p', '1', true, { length: '245' }), // another route
      pathway('w4', 'e', 'p', '1') // no length: matches
    ], 'duplicate_pathway')).toEqual([['w2', 'duplicate_pathway'], ['w4', 'duplicate_pathway']]);
  });

  it('suggests checking a length or traversal_time that doesn\'t fit the distance between its stops', () => {
    // e and p are about 111 m apart (0.001° of longitude at the equator).
    const ends = [at(stop('e', '2'), [0, 0]), at(stop('p', '0'), [0.001, 0])];
    const lengthOf = (length: string) => only([station, ...ends, pathway('w', 'e', 'p', '1', true, { length })],
      'length_too_short', 'length_too_long');
    expect(lengthOf('111')).toEqual([]);
    expect(lengthOf('80')).toEqual([]); // within half to double
    expect(lengthOf('400')).toEqual([['w', 'length_too_long']]);
    // Too short only between points: p is a platform, an area placed at one point.
    expect(lengthOf('20')).toEqual([]);
    const nodes = [at(stop('e', '2'), [0, 0]), at(stop('n', '3'), [0.001, 0])];
    expect(only([station, ...nodes, pathway('w', 'e', 'n', '1', true, { length: '20' })], 'length_too_short'))
      .toEqual([['w', 'length_too_short']]);
    // Stairs aren't drawn at their real length.
    expect(only([station, ...ends, pathway('w', 'e', 'p', '2', true, { length: '400' })], 'length_too_long')).toEqual([]);

    const timeOf = (traversal_time: string) => only([station, ...ends, pathway('w', 'e', 'p', '3', true, { traversal_time })], 'traversal_time_mismatch');
    expect(timeOf('120')).toEqual([]); // ~0.9 m/s
    expect(timeOf('5000')).toEqual([['w', 'traversal_time_mismatch']]); // ~0.02 m/s
    expect(timeOf('10')).toEqual([['w', 'traversal_time_mismatch']]); // ~11 m/s
    // A length is used when there is one: 10 m in 120 s is ~0.08 m/s.
    expect(only([station, ...ends, pathway('w', 'e', 'p', '3', true, { length: '10', traversal_time: '120' })],
      'traversal_time_mismatch')).toEqual([['w', 'traversal_time_mismatch']]);
  });

  it('flags a pathway whose stops are farther apart than its kind spans', () => {
    // e and p are about 111 m apart: too far for an elevator (50 m), not for stairs (150 m) or a walkway (500 m).
    const ends = [at(stop('e', '2'), [0, 0]), at(stop('p', '0'), [0.001, 0])];
    expect(only([station, ...ends, pathway('w1', 'e', 'p', '5'), pathway('w2', 'e', 'p', '2'), pathway('w3', 'e', 'p', '1')],
      'pathway_ends_far_apart')).toEqual([['w1', 'pathway_ends_far_apart']]);
  });

  it('suggests checking stops at the same spot on the same level, unless a gate or elevator joins them', () => {
    const spot = (entity: LevelEntity) => at(entity, [0.001, 0.001]);
    const entities = [
      station, at(stop('e', '2', 'L0'), [0, 0]), spot(stop('p1', '0', 'L1')), spot(stop('p2', '0', 'L1')),
      spot(stop('g1', '3', 'L0')), spot(stop('g2', '3', 'L0')), spot(stop('up', '3', 'L2')), // up: stacked, another level
      pathway('w1', 'e', 'p1', '1'), pathway('w2', 'e', 'p2', '1'), pathway('w3', 'e', 'g1', '1'),
      pathway('gate', 'g1', 'g2', '6'), pathway('w4', 'g2', 'up', '2')
    ];
    expect(only(entities, 'stops_share_position')).toEqual([['p1', 'stops_share_position'], ['p2', 'stops_share_position']]);
  });

  it('flags a stop more than 500 m from its station', () => {
    const stationAt = at(station, [0, 0]);
    expect(only([stationAt, at(stop('e', '2'), [0.001, 0]), at(stop('p', '0'), [0.01, 0])], 'far_from_station'))
      .toEqual([['p', 'far_from_station']]); // ~1.1 km; e is ~111 m
  });

  it('measures the straight line between the stops, not the drawing, as the GTFS export carries it', () => {
    const ends = [at(stop('e', '2'), [0, 0]), at(stop('p', '0'), [0.001, 0])];
    const bent = { id: 'w', type: 'way', nodes: ['e', 'k', 'p'], tags: { pathway_mode: '1', is_bidirectional: '1', length: '111' } };
    expect(only([station, ...ends, at(node('k'), [0.0005, 0.002]), bent], 'length_too_short', 'length_too_long')).toEqual([]);
    // Stops under 1 m apart likely have copied coordinates, so they're not measured, but reported.
    const close = [at(stop('e', '2'), [0, 0]), at(stop('p', '0'), [0.000001, 0])];
    expect(only([station, ...close, pathway('w', 'e', 'p', '1', true, { length: '400' })], 'length_too_long',
      'stops_share_location')).toEqual([['w', 'stops_share_location']]);
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
    // Levels at the same height aren't a change of level.
    const level = (id: string, levelId: string): LevelEntity =>
      ({ id, type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { level_id: levelId, level_index: '0' } });
    expect(only([
      station, stop('e', '2', 'L0'), stop('p', '0', 'L1'), level('a0', 'L0'), level('a1', 'L1'), pathway('w', 'e', 'p', '1')
    ], 'walkway_changes_level')).toEqual([]);
  });

  it('flags a boarding area on a different level from its platform', () => {
    const platform = node('p', { location_type: '0', parent_station: 'S', stop_id: 'P1', level_id: 'L1' });
    const area = (levelId: string) => node('b', { location_type: '4', parent_station: 'P1', level_id: levelId });
    expect(only([station, platform, area('L2')], 'boarding_area_level')).toEqual([['b', 'boarding_area_level']]);
    expect(only([station, platform, area('L1')], 'boarding_area_level')).toEqual([]);
  });

  it('applies MobilityData\'s pathway rules (as TDEI\'s validator, 8.0.1, does)', () => {
    const platform = node('p', { location_type: '0', parent_station: 'S', stop_id: 'P1', level_id: 'L1' });
    const area = node('b', { location_type: '4', parent_station: 'P1', level_id: 'L1' });
    expect(only([
      station, stop('e', '2', 'L0'), stop('n', '3', 'L0'), platform, area,
      node('street', { location_type: '0', parent_station: 'S', stop_access: '1', level_id: 'L0' }),
      node('lift', { location_type: '3', parent_station: 'S' }), // no level_id
      pathway('w1', 'e', 's', '1'), // to the station
      pathway('w2', 'n', 'p', '1'), // to a platform with boarding areas
      pathway('w3', 'n', 'b', '1'),
      { id: 'w4', type: 'way', nodes: ['n', 'k', 'n'], tags: { pathway_mode: '1', is_bidirectional: '1' } }, // loop
      pathway('w5', 'e', 'street', '1'), // to a stop reached from the street
      pathway('w6', 'n', 'lift', '5') // an elevator end without a level
    ], 'pathway_to_station', 'pathway_to_platform_with_boarding_areas', 'pathway_loop', 'pathway_to_street_access_stop',
    'elevator_end_no_level')).toEqual([
      ['lift', 'elevator_end_no_level'],
      ['w1', 'pathway_to_station'],
      ['w2', 'pathway_to_platform_with_boarding_areas'],
      ['w4', 'pathway_loop'],
      ['w5', 'pathway_to_street_access_stop']
    ]);
  });

  it('skips platforms with boarding areas when checking reachability, as riders board from those', () => {
    const platform = node('p', { location_type: '0', parent_station: 'S', stop_id: 'P1' });
    const area = node('b', { location_type: '4', parent_station: 'P1' });
    expect(only([station, stop('e', '2'), platform, area, pathway('w1', 'e', 'b', '1')], 'unreachable', 'isolated'))
      .toEqual([]); // the platform itself has no pathway, which is right
  });
});
