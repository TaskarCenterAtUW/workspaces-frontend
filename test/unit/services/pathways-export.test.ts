import { describe, expect, it } from 'vitest';
import { buildPathwaysCsvArchive, openTdeiPathwaysArchive } from '~/services/pathways';

// buildPathwaysCsvArchive turns workspace OSM elements back into GTFS
// stops.txt/pathways.txt. Imported features carry their GTFS IDs as tags and
// keep them (other feed files reference them); features drawn in the editor have
// none, so their IDs are generated from the OSM element ID.

type Row = Record<string, string>;

function node(id: number, tags?: Record<string, string>) {
  return { type: 'node', id, lat: 47.6, lon: -122.3, ...(tags ? { tags } : {}) };
}

function way(id: number, nodes: number[], tags?: Record<string, string>) {
  return { type: 'way', id, nodes, ...(tags ? { tags } : {}) };
}

/** Exports the elements and reads back each file's raw text and parsed rows. */
async function exportFeed(elements: any[]) {
  const archive = await buildPathwaysCsvArchive(elements);
  const text = await openTdeiPathwaysArchive(archive, false);
  const parsed = await openTdeiPathwaysArchive(archive, true);

  return {
    stopsText: text.get('stops.txt') as string,
    pathwaysText: text.get('pathways.txt') as string,
    stops: parsed.get('stops.txt') as Row[],
    pathways: parsed.get('pathways.txt') as Row[]
  };
}

const endpoints = (row: Row) => [row.pathway_id, row.from_stop_id, row.to_stop_id];

describe('buildPathwaysCsvArchive GTFS IDs', () => {
  it('keeps the stop_id and pathway_id tags of imported features', async () => {
    const { stops, pathways } = await exportFeed([
      node(1, { stop_id: 'PLAT_A', location_type: '0' }),
      node(2, { stop_id: 'ENT_1', location_type: '2' }),
      way(10, [1, 2], { pathway_id: 'PW_1', pathway_mode: '1', is_bidirectional: '1' })
    ]);

    expect(stops.map(row => row.stop_id)).toEqual(['PLAT_A', 'ENT_1']);
    expect(pathways.map(endpoints)).toEqual([['PW_1', 'PLAT_A', 'ENT_1']]);
  });

  it('generates prefixed IDs from the OSM ID for features without one', async () => {
    const { stops, pathways } = await exportFeed([
      node(1, { location_type: '0' }),
      node(2),
      way(10, [1, 2], { pathway_mode: '2', is_bidirectional: '1' })
    ]);

    expect(stops.map(row => row.stop_id)).toEqual(['ws-n1', 'ws-n2']);
    expect(pathways.map(endpoints)).toEqual([['ws-w10', 'ws-n1', 'ws-n2']]);
  });

  it('links pathways to stops whatever order the elements arrive in', async () => {
    const { pathways } = await exportFeed([
      way(10, [1, 2], { pathway_id: 'PW_1' }),
      node(1, { stop_id: 'A' }),
      node(2)
    ]);

    expect(pathways.map(endpoints)).toEqual([['PW_1', 'A', 'ws-n2']]);
  });

  it('keeps a duplicated ID on the first feature and generates IDs for the copies', async () => {
    const { stops, pathways } = await exportFeed([
      node(1, { stop_id: 'A' }),
      node(2, { stop_id: 'A' }),
      way(10, [1, 2], { pathway_id: 'PW' }),
      way(11, [2, 1], { pathway_id: 'PW' })
    ]);

    expect(stops.map(row => row.stop_id)).toEqual(['A', 'ws-n2']);
    expect(pathways.map(endpoints)).toEqual([
      ['PW', 'A', 'ws-n2'],
      ['ws-w11', 'ws-n2', 'A']
    ]);
  });

  it('never generates an ID that an imported feature already uses', async () => {
    const { stops } = await exportFeed([
      node(1, { stop_id: 'ws-n2' }),
      node(2, { location_type: '3' })
    ]);

    expect(stops.map(row => row.stop_id)).toEqual(['ws-n2', 'ws-n2-2']);
  });

  it('ignores blank ID tags', async () => {
    const { stops } = await exportFeed([node(1, { stop_id: '  ' })]);

    expect(stops.map(row => row.stop_id)).toEqual(['ws-n1']);
  });
});

describe('buildPathwaysCsvArchive pathway geometry', () => {
  it('runs a pathway from its first node to its last, ignoring bends', async () => {
    const { stops, pathways } = await exportFeed([
      node(1, { stop_id: 'A' }),
      node(2),
      node(3),
      node(4, { stop_id: 'B' }),
      way(10, [1, 2, 3, 4], { pathway_id: 'PW' })
    ]);

    expect(pathways.map(endpoints)).toEqual([['PW', 'A', 'B']]);
    // Untagged bend nodes aren't stops.
    expect(stops.map(row => row.stop_id)).toEqual(['A', 'B']);
  });

  it('still exports tagged nodes that sit in the middle of a pathway', async () => {
    const { stops } = await exportFeed([
      node(1, { stop_id: 'A' }),
      node(2, { stop_id: 'MID', location_type: '3' }),
      node(3, { stop_id: 'B' }),
      way(10, [1, 2, 3])
    ]);

    expect(stops.map(row => row.stop_id)).toEqual(['A', 'MID', 'B']);
  });

  it('skips ways with fewer than two nodes', async () => {
    const { pathways } = await exportFeed([node(1, { stop_id: 'A' }), way(10, [1])]);

    expect(pathways).toEqual([]);
  });
});

describe('buildPathwaysCsvArchive columns', () => {
  it('writes every stops.txt and pathways.txt column from the GTFS reference', async () => {
    const { stopsText, pathwaysText } = await exportFeed([]);

    expect(stopsText.split('\n')[0]).toBe(
      'stop_id,stop_code,stop_name,tts_stop_name,stop_desc,stop_lat,stop_lon,zone_id,'
      + 'stop_url,location_type,parent_station,stop_timezone,wheelchair_boarding,level_id,'
      + 'platform_code,stop_access'
    );
    expect(pathwaysText.split('\n')[0]).toBe(
      'pathway_id,from_stop_id,to_stop_id,pathway_mode,is_bidirectional,length,'
      + 'traversal_time,stair_count,max_slope,min_width,signposted_as,reversed_signposted_as'
    );
  });

  it('fills optional columns from tags and the coordinates from the node', async () => {
    const { stops, pathways } = await exportFeed([
      node(1, { stop_id: 'A', stop_code: '42', wheelchair_boarding: '1', level_id: 'L1', stop_access: '0' }),
      node(2, { stop_id: 'B' }),
      way(10, [1, 2], { pathway_id: 'PW', length: '12.5', stair_count: '-20', signposted_as: 'Exit' })
    ]);

    expect(stops[0]).toMatchObject({
      stop_id: 'A',
      stop_code: '42',
      stop_lat: '47.6',
      stop_lon: '-122.3',
      wheelchair_boarding: '1',
      level_id: 'L1',
      stop_access: '0'
    });
    expect(pathways[0]).toMatchObject({ length: '12.5', stair_count: '-20', signposted_as: 'Exit' });
  });

  it('derives endpoints from the way, not stale from/to_stop_id tags', async () => {
    const { pathways } = await exportFeed([
      node(1, { stop_id: 'A' }),
      node(2, { stop_id: 'B' }),
      way(10, [1, 2], { pathway_id: 'PW', from_stop_id: 'OLD_X', to_stop_id: 'OLD_Y' })
    ]);

    expect(pathways.map(endpoints)).toEqual([['PW', 'A', 'B']]);
  });

  it('leaves out tags that are not GTFS columns', async () => {
    const { stopsText } = await exportFeed([node(1, { stop_id: 'A', note: 'check later' })]);

    expect(stopsText).not.toContain('check later');
  });

  it('quotes values containing commas, quotes or line breaks', async () => {
    const { stops, stopsText } = await exportFeed([
      node(1, { stop_id: 'A', stop_name: 'Main St, North Entrance', stop_desc: 'Say "hi"\nthen go' })
    ]);

    expect(stopsText).toContain('"Main St, North Entrance"');
    expect(stopsText).toContain('"Say ""hi""\nthen go"');
    expect(stops[0]).toMatchObject({
      stop_name: 'Main St, North Entrance',
      stop_desc: 'Say "hi"\nthen go'
    });
  });
});
