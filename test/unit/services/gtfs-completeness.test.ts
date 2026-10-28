import { describe, expect, it } from 'vitest';
import { buildCompletenessIndex, completenessProblems } from '~/services/gtfs-completeness';
import type { LevelEntity } from '~/services/pathways-levels';

const node = (id: string, tags?: Record<string, string>): LevelEntity => ({ id, type: 'node', ...(tags ? { tags } : {}) });
const way = (id: string, nodes: string[], tags: Record<string, string> = {}): LevelEntity => ({ id, type: 'way', nodes, tags });

// Central has an entrance and a node on L1; Lonely has nothing. L2 has an
// outline but no stops. Pathway p1 joins two stops; p2 runs from a stop to a
// bare node; p3 is bare at both ends.
const entities = [
  node('s1', { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' }),
  node('s2', { location_type: '1', stop_id: 'LONELY', stop_name: 'Lonely' }),
  node('s3', { location_type: '1', stop_name: 'Unnumbered' }),
  node('e1', { location_type: '2', parent_station: 'CENTRAL' }),
  node('n1', { location_type: '3', parent_station: 'CENTRAL', level_id: 'L1' }),
  node('x1'), node('x2'), node('x3'),
  way('p1', ['e1', 'n1'], { pathway_mode: '1' }),
  way('p2', ['n1', 'x1'], { pathway_mode: '1' }),
  way('p3', ['x2', 'x3'], { pathway_mode: '1' }),
  way('a1', ['c1', 'c2', 'c3', 'c1'], { level_id: 'L1', level_index: '0' }),
  way('a2', ['c1', 'c2', 'c3', 'c1'], { level_id: 'L2', level_index: '1', level_name: 'Mezzanine' }),
  way('a3', ['c1', 'c2', 'c3', 'c1'], { level_index: '2' })
];
const byId = new Map(entities.map(entity => [entity.id, entity]));
const index = buildCompletenessIndex(entities);
const problems = (id: string) => completenessProblems(byId.get(id)!, other => byId.get(String(other)), index)
  .map(({ subtype, message, relatedIds }) => [subtype, message, relatedIds]);

describe('completenessProblems', () => {
  it('flags pathways whose start or end isn\'t a stop', () => {
    expect(problems('p1')).toEqual([]);
    expect(problems('p2')).toEqual([['pathway_end', 'This pathway\'s end isn\'t a stop', ['x1']]]);
    expect(problems('p3')).toEqual([['pathway_end', 'Neither end of this pathway is a stop', ['x2', 'x3']]]);
  });

  it('flags levels no stop is on', () => {
    expect(problems('a1')).toEqual([]);
    expect(problems('a2')).toEqual([['empty_level', 'No stops are on level Mezzanine (L2)', []]]);
    expect(problems('a3')).toEqual([]); // no level_id: flagged elsewhere
  });

  it('flags stations no stop belongs to, or with no stop_id to belong to', () => {
    expect(problems('s1')).toEqual([]);
    expect(problems('s2')).toEqual([['empty_station', 'Station Lonely has no stops or levels', []]]);
    expect(problems('s3')).toEqual([['station_no_stop_id', 'This station has no stop_id, so no stops can name it as their parent_station', []]]);
  });

  it('leaves other stops and bare nodes alone', () => {
    expect(problems('e1')).toEqual([]);
    expect(problems('x1')).toEqual([]);
  });
});
