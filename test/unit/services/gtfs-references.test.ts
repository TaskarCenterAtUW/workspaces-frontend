import { describe, expect, it } from 'vitest';
import { buildReferenceIndex, referenceProblems, suggestedStopIds } from '~/services/gtfs-references';
import type { LevelEntity } from '~/services/pathways-levels';

// GTFS references between stops must resolve: parent_station to a station (a
// platform, for boarding areas), level_id to a drawn level, stop_id to one stop.

const node = (id: string, tags?: Record<string, string>): LevelEntity => ({ id, type: 'node', ...(tags ? { tags } : {}) });
const levelArea = (id: string, levelId: string): LevelEntity =>
  ({ id, type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { area: 'yes', level_id: levelId, level_index: '0' } });

const station = () => [
  node('s1', { location_type: '1', stop_id: 'CENTRAL' }),
  node('p1', { location_type: '0', stop_id: 'P1', parent_station: 'CENTRAL', level_id: 'L0' }),
  levelArea('a0', 'L0')
];

function problemsOf(entity: LevelEntity, entities: LevelEntity[]) {
  return referenceProblems(entity, buildReferenceIndex([...entities, entity]))
    .map(problem => [problem.subtype, problem.message]);
}

describe('referenceProblems', () => {
  it('accepts a well-formed station', () => {
    const entities = [
      ...station(),
      node('e1', { location_type: '2', stop_id: 'E1', parent_station: 'CENTRAL' }),
      node('n1', { location_type: '3', parent_station: 'CENTRAL', level_id: 'L0' }),
      node('b1', { location_type: '4', parent_station: 'P1', level_id: 'L0' })
    ];
    const index = buildReferenceIndex(entities);
    for (const entity of entities) {
      expect(referenceProblems(entity, index), String(entity.id)).toEqual([]);
    }
  });

  it('flags a parent_station that matches no stop', () => {
    expect(problemsOf(node('e1', { location_type: '2', parent_station: 'NOWHERE' }), station())).toEqual([
      ['parent_station', 'parent_station "NOWHERE" doesn\'t match any stop\'s stop_id']
    ]);
  });

  it('flags a parent_station of the wrong kind', () => {
    // An entrance pointing at a platform; a boarding area pointing at the station.
    expect(problemsOf(node('e1', { location_type: '2', parent_station: 'P1' }), station())).toEqual([
      ['parent_station', 'This entrance\'s parent_station "P1" should be a station, but it\'s a platform']
    ]);
    expect(problemsOf(node('b1', { location_type: '4', parent_station: 'CENTRAL' }), station())).toEqual([
      ['parent_station', 'This boarding area\'s parent_station "CENTRAL" should be a platform, but it\'s a station']
    ]);
  });

  it('treats an empty location_type as a platform', () => {
    const entities = [...station(), node('p2', { stop_id: 'P2', parent_station: 'CENTRAL' })];
    expect(problemsOf(node('b1', { location_type: '4', parent_station: 'P2' }), entities)).toEqual([]);
  });

  it('flags a station with a parent_station', () => {
    expect(problemsOf(node('s2', { location_type: '1', stop_id: 'S2', parent_station: 'CENTRAL' }), station())).toEqual([
      ['parent_station', 'Stations can\'t have a parent_station (this one has "CENTRAL")']
    ]);
  });

  it('flags missing parent_station where GTFS requires one, but not on platforms', () => {
    expect(problemsOf(node('e1', { location_type: '2' }), station())).toEqual([
      ['parent_station', 'This entrance needs a parent_station: the stop_id of its station']
    ]);
    expect(problemsOf(node('b1', { location_type: '4', level_id: 'L0' }), station())).toEqual([
      ['parent_station', 'This boarding area needs a parent_station: the stop_id of its platform']
    ]);
    expect(problemsOf(node('p9', { location_type: '0', stop_id: 'P9' }), station())).toEqual([]);
  });

  it('flags a level_id with no level outline', () => {
    expect(problemsOf(node('n1', { location_type: '3', parent_station: 'CENTRAL', level_id: 'L9' }), station())).toEqual([
      ['level_id', 'level_id "L9" doesn\'t match any level outline in this workspace']
    ]);
  });

  it('flags every stop sharing a stop_id, pointing at the others', () => {
    const entities = [...station(), node('p2', { location_type: '0', stop_id: 'P1', parent_station: 'CENTRAL' })];
    const index = buildReferenceIndex(entities);

    const [problem] = referenceProblems(entities[1]!, index);
    expect(problem).toMatchObject({ subtype: 'stop_id', message: 'stop_id "P1" is also used by another stop', relatedIds: ['p2'] });
    expect(referenceProblems(entities[3]!, index)[0]).toMatchObject({ subtype: 'stop_id', relatedIds: ['p1'] });
  });

  it('ignores untagged nodes and ways', () => {
    const index = buildReferenceIndex(station());
    expect(referenceProblems(node('x'), index)).toEqual([]);
    expect(referenceProblems(levelArea('a9', 'NOPE'), index)).toEqual([]);
  });
});

describe('suggestedStopIds', () => {
  it('suggests stop_ids for stations and platforms without one, from their names', () => {
    const suggestions = suggestedStopIds([
      node('s1', { location_type: '1', stop_name: 'Central Station' }),
      node('s2', { location_type: '1' }),
      node('p1', { location_type: '0', stop_name: 'Platform 1' }),
      node('p2', { stop_name: '  ' }), // empty location_type = platform
      node('e1', { location_type: '2', stop_name: 'Main entrance' }), // entrances aren't parents
      node('s3', { location_type: '1', stop_id: 'HAS_ONE' })
    ]);
    expect(Object.fromEntries(suggestions)).toEqual({
      s1: 'CENTRAL_STATION', s2: 'STATION', p1: 'PLATFORM_1', p2: 'PLATFORM'
    });
  });

  it('keeps suggestions unique, avoiding existing stop_ids', () => {
    const suggestions = suggestedStopIds([
      node('s0', { location_type: '1', stop_id: 'CENTRAL' }),
      node('s1', { location_type: '1', stop_name: 'Central' }),
      node('s2', { location_type: '1', stop_name: 'central!' })
    ]);
    expect([...suggestions.values()]).toEqual(['CENTRAL_2', 'CENTRAL_3']);
  });

  it('lets a parent_station name a station\'s suggested stop_id without a warning', () => {
    const entities = [
      node('s1', { location_type: '1', stop_name: 'Central' }),
      node('e1', { location_type: '2', parent_station: 'CENTRAL' })
    ];
    expect(referenceProblems(entities[1]!, buildReferenceIndex(entities))).toEqual([]);
  });
});
