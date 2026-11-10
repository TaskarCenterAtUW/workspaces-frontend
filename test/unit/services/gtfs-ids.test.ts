import { describe, expect, it } from 'vitest';
import { numberedId, pathwayIdGenerator, stopIdGenerator } from '~/services/gtfs-ids';
import type { LevelEntity } from '~/services/pathways-levels';

const node = (id: string, tags?: Record<string, string>): LevelEntity => ({ id, type: 'node', ...(tags ? { tags } : {}) });
const way = (id: string, nodes: string[], tags: Record<string, string> = {}): LevelEntity => ({ id, type: 'way', nodes, tags });

// Like workspace 211: station STN_N06, with stops and pathways named after N06.
const entities = [
  node('s1', { location_type: '1', stop_id: 'STN_N06', stop_name: 'Wiehle-Reston East' }),
  node('s2', { location_type: '1', stop_id: 'STN_D03_F03', stop_name: 'L\'Enfant Plaza' }),
  node('p1', { location_type: '0', parent_station: 'STN_N06', stop_id: 'PF_N06_1' }),
  node('p2', { location_type: '0', parent_station: 'STN_N06' }),
  node('e1', { location_type: '2', parent_station: 'STN_D03_F03' }),
  node('n1', { location_type: '3', parent_station: 'STN_N06' }),
  node('b1', { location_type: '4', parent_station: 'PF_N06_1' }),
  node('loose', { location_type: '3' }),
  node('s3', { location_type: '1', stop_name: 'Spring Hill' }),
  way('w1', ['p1', 'n1'], { pathway_id: 'N06_191067' }),
  way('w2', ['n1', 'p2']),
  way('w3', ['loose', 'e1']),
  way('w4', ['loose', 'loose'])
];
const byId = new Map(entities.map(entity => [entity.id, entity]));

describe('stopIdGenerator', () => {
  it('names stops <type prefix>_<station code>_<n>, skipping numbers in use', () => {
    const generate = stopIdGenerator(entities);
    const used = new Set(['PF_N06_1']);
    const make = (id: string) => {
      const stopId = generate(byId.get(id)!, used);
      if (stopId) used.add(stopId);
      return stopId;
    };
    expect(make('p2')).toBe('PF_N06_2');
    expect(make('e1')).toBe('ENT_D03_F03_1');
    expect(make('n1')).toBe('NODE_N06_1');
    expect(make('b1')).toBe('BA_N06_1'); // via its platform
    expect(make('s3')).toBe('STN_SPRING_HILL'); // a station's own code: stop_code, else name
    expect(make('loose')).toBeUndefined(); // no station
  });
});

describe('pathwayIdGenerator', () => {
  it('names pathways <station code>_<n>, counting on from the highest number in use', () => {
    const generate = pathwayIdGenerator(entities);
    const used = new Set(['N06_191067']);
    expect(generate(byId.get('w2')!, used)).toBe('N06_191068');
    expect(generate(byId.get('w2')!, used)).toBe('N06_191069');
    expect(generate(byId.get('w3')!, used)).toBe('D03_F03_191070'); // from its end stop's station
    expect(generate(byId.get('w4')!, used)).toBeUndefined(); // no station at either end
  });

  it('starts at 1, and skips IDs in use', () => {
    const generate = pathwayIdGenerator(entities.filter(entity => entity.id !== 'w1'));
    expect(generate(byId.get('w2')!, new Set(['N06_1']))).toBe('N06_2');
  });
});

describe('numberedId', () => {
  it('picks the first free <base>_<n>', () => {
    expect(numberedId('PF_N06', new Set())).toBe('PF_N06_1');
    expect(numberedId('PF_N06', new Set(['PF_N06_1', 'PF_N06_2']))).toBe('PF_N06_3');
  });
});
