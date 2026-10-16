import { describe, expect, it } from 'vitest';
import { buildPathwaysCsvArchive, openTdeiPathwaysArchive } from '~/services/pathways';

// buildPathwaysCsvArchive turns workspace OSM elements back into GTFS
// stops.txt/pathways.txt. Imported features carry their GTFS IDs as tags and
// keep them (other feed files reference them); features drawn in the editor have
// none, so their IDs are generated from the OSM element ID.

function node(id: number, tags?: Record<string, string>) {
  return { type: 'node', id, lat: 47.6, lon: -122.3, ...(tags ? { tags } : {}) };
}

function way(id: number, nodes: number[], tags?: Record<string, string>) {
  return { type: 'way', id, nodes, ...(tags ? { tags } : {}) };
}

/** Exports the elements and returns each file's rows (header dropped) split into columns. */
async function exportRows(elements: any[]) {
  const archive = await buildPathwaysCsvArchive(elements);
  const files = await openTdeiPathwaysArchive(archive, false);
  const rows = (name: string) => (files.get(name) as string)
    .trim().split('\n').slice(1).map(line => line.split(','));

  return { stops: rows('stops.txt'), pathways: rows('pathways.txt') };
}

describe('buildPathwaysCsvArchive GTFS IDs', () => {
  it('keeps the stop_id and pathway_id tags of imported features', async () => {
    const { stops, pathways } = await exportRows([
      node(1, { stop_id: 'PLAT_A', location_type: '0' }),
      node(2, { stop_id: 'ENT_1', location_type: '2' }),
      way(10, [1, 2], { pathway_id: 'PW_1', pathway_mode: '1', is_bidirectional: '1' })
    ]);

    expect(stops.map(row => row[0])).toEqual(['PLAT_A', 'ENT_1']);
    expect(pathways).toEqual([['PW_1', 'PLAT_A', 'ENT_1', '1', '1']]);
  });

  it('generates prefixed IDs from the OSM ID for features without one', async () => {
    const { stops, pathways } = await exportRows([
      node(1, { location_type: '0' }),
      node(2),
      way(10, [1, 2], { pathway_mode: '2', is_bidirectional: '1' })
    ]);

    expect(stops.map(row => row[0])).toEqual(['ws-n1', 'ws-n2']);
    expect(pathways).toEqual([['ws-w10', 'ws-n1', 'ws-n2', '2', '1']]);
  });

  it('links pathways to stops whatever order the elements arrive in', async () => {
    const { pathways } = await exportRows([
      way(10, [1, 2], { pathway_id: 'PW_1' }),
      node(1, { stop_id: 'A' }),
      node(2)
    ]);

    expect(pathways[0]!.slice(0, 3)).toEqual(['PW_1', 'A', 'ws-n2']);
  });

  it('keeps a duplicated ID on the first feature and generates IDs for the copies', async () => {
    const { stops, pathways } = await exportRows([
      node(1, { stop_id: 'A' }),
      node(2, { stop_id: 'A' }),
      way(10, [1, 2], { pathway_id: 'PW' }),
      way(11, [2, 1], { pathway_id: 'PW' })
    ]);

    expect(stops.map(row => row[0])).toEqual(['A', 'ws-n2']);
    expect(pathways.map(row => row.slice(0, 3))).toEqual([
      ['PW', 'A', 'ws-n2'],
      ['ws-w11', 'ws-n2', 'A']
    ]);
  });

  it('never generates an ID that an imported feature already uses', async () => {
    const { stops } = await exportRows([
      node(1, { stop_id: 'ws-n2' }),
      node(2)
    ]);

    expect(stops.map(row => row[0])).toEqual(['ws-n2', 'ws-n2-2']);
  });

  it('ignores blank ID tags', async () => {
    const { stops } = await exportRows([node(1, { stop_id: '  ' })]);

    expect(stops.map(row => row[0])).toEqual(['ws-n1']);
  });
});
