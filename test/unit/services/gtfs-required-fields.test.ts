import { describe, expect, it } from 'vitest';
import { requiredFieldProblems } from '~/services/gtfs-required-fields';
import type { LevelEntity } from '~/services/pathways-levels';

const node = (tags: Record<string, string> = {}): LevelEntity => ({ id: 'n1', type: 'node', tags });
const way = (tags: Record<string, string>, nodes = ['a', 'b']): LevelEntity => ({ id: 'w1', type: 'way', nodes, tags });
const missing = (entity: LevelEntity) => requiredFieldProblems(entity).map(problem => [problem.subtype, problem.message]);

describe('requiredFieldProblems', () => {
  it('requires a stop_name for stops, platforms, stations and entrances', () => {
    expect(missing(node({ location_type: '1', stop_id: 'S1' }))).toEqual([['stop_name', 'This station needs a stop_name']]);
    expect(missing(node({ location_type: '0' }))).toEqual([['stop_name', 'This platform needs a stop_name']]);
    expect(missing(node({ location_type: '2', stop_name: '  ' }))).toEqual([['stop_name', 'This entrance needs a stop_name']]);
    expect(missing(node({ stop_id: 'X' }))).toEqual([['stop_name', 'This stop needs a stop_name']]); // no location_type = 0
    expect(missing(node({ location_type: '1', stop_name: 'Central' }))).toEqual([]);
  });

  it('doesn\'t require a stop_name for generic nodes or boarding areas, or check untagged nodes', () => {
    expect(missing(node({ location_type: '3' }))).toEqual([]);
    expect(missing(node({ location_type: '4' }))).toEqual([]);
    expect(missing(node())).toEqual([]);
  });

  it('requires pathway_mode and is_bidirectional on pathways', () => {
    expect(missing(way({ pathway_mode: '1' }))).toEqual([['is_bidirectional', 'This pathway needs is_bidirectional']]);
    expect(missing(way({ is_bidirectional: '0' }))).toEqual([['pathway_mode', 'This pathway needs a pathway_mode']]);
    expect(missing(way({}))).toEqual([
      ['pathway_mode', 'This pathway needs a pathway_mode'],
      ['is_bidirectional', 'This pathway needs is_bidirectional']
    ]);
    expect(missing(way({ pathway_mode: '2', is_bidirectional: '1' }))).toEqual([]);
  });

  it('requires a level_index value on level outlines, but not pathway fields', () => {
    expect(missing(way({ level_index: '', level_id: 'L1' }, ['a', 'b', 'c', 'a']))).toEqual([['level_index', 'This level needs a level_index']]);
    expect(missing(way({ level_index: '0', level_id: 'L1' }, ['a', 'b', 'c', 'a']))).toEqual([]);
    expect(missing(way({ area: 'yes', level_id: 'L1' }, ['a', 'b', 'c', 'a']))).toEqual([['level_index', 'This level needs a level_index']]);
  });

  it('doesn\'t require IDs, which the export generates', () => {
    expect(missing(node({ location_type: '1', stop_name: 'Central' }))).toEqual([]); // no stop_id
    expect(missing(way({ pathway_mode: '1', is_bidirectional: '1' }))).toEqual([]); // no pathway_id
  });

  it('gives each problem a hash by subtype', () => {
    expect(requiredFieldProblems(way({})).map(problem => problem.hash)).toEqual(['missing:pathway_mode', 'missing:is_bidirectional']);
  });
});
