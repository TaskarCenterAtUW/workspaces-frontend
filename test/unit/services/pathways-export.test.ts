import { describe, expect, it, vi } from 'vitest';
import { TdeiExporter, TdeiExporterContext } from '~/services/export/tdei';
import {
  buildPathwaysCsvArchive,
  fetchDerivedPathwaysDataset,
  mergeIntoAgencyFeed,
  missingFeedFiles,
  openAgencyFeed,
  openTdeiPathwaysArchive
} from '~/services/pathways';
import { WorkspacesClient } from '~/services/workspaces';
import { createGtfsArchive } from '~/util/gtfs';

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
async function exportFeed(elements: any[], gtfsFiles?: Map<string, string>) {
  const archive = await buildPathwaysCsvArchive(elements, gtfsFiles);
  const text = await openTdeiPathwaysArchive(archive, false);
  const parsed = await openTdeiPathwaysArchive(archive, true);

  return {
    stopsText: text.get('stops.txt') as string,
    pathwaysText: text.get('pathways.txt') as string,
    stops: parsed.get('stops.txt') as Row[],
    pathways: parsed.get('pathways.txt') as Row[],
    levels: parsed.get('levels.txt') as Row[] | undefined
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

  it('generates STN_<code> IDs for stations without one, from stop_code or name', async () => {
    const { stops } = await exportFeed([
      node(1, { location_type: '1', stop_code: 'J02', stop_name: 'Van Dorn' }),
      node(2, { location_type: '1', stop_name: 'Van Dorn' }),
      node(3, { location_type: '1', stop_name: 'Van-Dorn' }),
      node(4, { location_type: '1', stop_id: 'STN_X' })
    ]);

    expect(stops.map(row => row.stop_id)).toEqual(['STN_J02', 'STN_VAN_DORN', 'STN_VAN_DORN_2', 'STN_X']);
  });

  it('names stops and pathways in a station after its code, like the imported feed', async () => {
    const { stops, pathways } = await exportFeed([
      node(1, { location_type: '1', stop_id: 'STN_N06' }),
      node(2, { location_type: '2', parent_station: 'STN_N06' }),
      node(3, { location_type: '0', parent_station: 'STN_N06', stop_id: 'PF_N06_1' }),
      node(4, { location_type: '0', parent_station: 'STN_N06' }),
      way(10, [2, 3], { pathway_id: 'N06_191067', pathway_mode: '1', is_bidirectional: '1' }),
      way(11, [2, 4], { pathway_mode: '1', is_bidirectional: '1' })
    ]);

    expect(stops.map(row => row.stop_id)).toEqual(['STN_N06', 'ENT_N06_1', 'PF_N06_1', 'PF_N06_2']);
    expect(pathways.map(endpoints)).toEqual([
      ['N06_191067', 'ENT_N06_1', 'PF_N06_1'],
      ['N06_191068', 'ENT_N06_1', 'PF_N06_2']
    ]);
  });

  it('links pathways to stops whatever order the elements arrive in', async () => {
    const { pathways } = await exportFeed([
      way(10, [1, 2], { pathway_id: 'PW_1' }),
      node(1, { stop_id: 'A' }),
      node(2)
    ]);

    expect(pathways.map(endpoints)).toEqual([['PW_1', 'A', 'ws-n2']]);
  });

  it('keeps a duplicated ID on the oldest feature, wherever its copy is listed', async () => {
    const { stops } = await exportFeed([
      node(9, { stop_id: 'A' }), // a later copy, listed first
      node(1, { stop_id: 'A' })
    ]);

    expect(stops.map(row => row.stop_id)).toEqual(['ws-n9', 'A']); // in listed order; the imported stop keeps A
  });

  it('exports a level outline missing its level_index as a level, not a pathway', async () => {
    const { stops, pathways } = await exportFeed([
      way(20, [5, 6, 7, 5], { area: 'yes', level_id: 'L1' }),
      node(5), node(6), node(7)
    ]);

    expect(pathways).toEqual([]);
    expect(stops).toEqual([]);
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

describe('buildPathwaysCsvArchive levels', () => {
  // A level is drawn as an area (closed way) tagged with the levels.txt columns.
  const levelBox = (id: number, tags: Record<string, string>) => [
    node(id * 10 + 1), node(id * 10 + 2), node(id * 10 + 3),
    way(id, [id * 10 + 1, id * 10 + 2, id * 10 + 3, id * 10 + 1], { area: 'yes', ...tags })
  ];

  it('writes levels.txt from level areas, not as pathways or stops', async () => {
    const { stops, pathways, levels } = await exportFeed([
      ...levelBox(5, { level_id: 'MEZ', level_index: '-1', level_name: 'Mezzanine' }),
      node(1, { stop_id: 'A', level_id: 'MEZ' })
    ]);

    expect(levels).toEqual([{ level_id: 'MEZ', level_index: '-1', level_name: 'Mezzanine' }]);
    expect(pathways).toEqual([]);
    expect(stops.map(row => row.stop_id)).toEqual(['A']);
  });

  it('generates a level_id for level areas without one', async () => {
    const { levels } = await exportFeed(levelBox(5, { level_index: '2' }));

    expect(levels).toEqual([{ level_id: 'ws-l5', level_index: '2', level_name: '' }]);
  });

  it('keeps the original levels and lets drawn levels with the same level_id replace them', async () => {
    const original = 'level_id,level_index,level_name\nL1,0,Old street\nL2,-1,Concourse\n';
    const { levels } = await exportFeed(
      levelBox(5, { level_id: 'L1', level_index: '0', level_name: 'Street' }),
      new Map([['levels.txt', original]])
    );

    expect(levels).toEqual([
      { level_id: 'L1', level_index: '0', level_name: 'Street' },
      { level_id: 'L2', level_index: '-1', level_name: 'Concourse' }
    ]);
  });

  it('writes no levels.txt when there are no levels', async () => {
    const { levels } = await exportFeed([node(1, { stop_id: 'A' })]);

    expect(levels).toBeUndefined();
  });
});

describe('both exports build on the original dataset', () => {
  // An original TDEI dataset: a GTFS zip with levels and the rest of a feed.
  async function originalDatasetZip() {
    return await createGtfsArchive(new Map([
      ['agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\nWMATA,Metro,https://wmata.com,America/New_York\n'],
      ['stop_times.txt', 'trip_id,stop_id,stop_sequence\nT1,PF_N06_1,1\n'],
      ['stops.txt', 'stop_id,stop_name\nOLD,Old\n'],
      ['levels.txt', 'level_id,level_index,level_name\nN06_L1,1,Mezzanine\nN06_L2,0,Platform\n']
    ]));
  }

  function fakeTdeiClient(exists = true) {
    return {
      getDatasetInfo: vi.fn(async () => (exists ? { tdei_dataset_id: 'D1' } : undefined)),
      downloadPathwaysDataset: vi.fn(async () => originalDatasetZip()),
      openDatasetArchive: vi.fn(async (zip: Blob) => ({ dataset: zip })),
      uploadPathwaysDataset: vi.fn(async () => 'job-1')
    };
  }

  // The workspace redraws N06_L1 and adds a stop; N06_L2 has no outline here.
  const elements = [
    node(1, { location_type: '0', stop_id: 'PF_N06_1', level_id: 'N06_L1' }),
    { type: 'way', id: 5, nodes: [11, 12, 13, 11], tags: { level_id: 'N06_L1', level_index: '2', level_name: 'Upper' } }
  ];
  const workspace = { id: 7, type: 'pathways', tdeiRecordId: 'D1', tdeiServiceId: 'S1', tdeiProjectGroupId: 'PG' } as any;
  const osmClient = { getWorkspaceData: vi.fn(async () => elements) } as any;
  const read = async (archive: Blob) => Object.fromEntries(await openTdeiPathwaysArchive(archive, false, false));

  it('fetches the original dataset\'s files, if it still exists', async () => {
    expect(await fetchDerivedPathwaysDataset(fakeTdeiClient() as any, undefined)).toEqual({});
    expect(await fetchDerivedPathwaysDataset(fakeTdeiClient(false) as any, 'D1')).toEqual({});

    const { datasetId, files } = await fetchDerivedPathwaysDataset(fakeTdeiClient() as any, 'D1');
    expect(datasetId).toBe('D1');
    expect([...files!.keys()].sort()).toEqual(['agency.txt', 'levels.txt', 'stop_times.txt', 'stops.txt']);
  });

  it('keeps the original\'s other files and levels in a Download', async () => {
    const download = await read(await new WorkspacesClient('http://api.test/', 'http://api.test/', fakeTdeiClient() as any, osmClient)
      .exportWorkspaceArchive(workspace));

    expect(download['agency.txt']).toContain('WMATA,Metro');
    expect(download['stop_times.txt']).toContain('T1,PF_N06_1,1');
    expect(download['levels.txt']).toContain('N06_L1,2,Upper'); // redrawn
    expect(download['levels.txt']).toContain('N06_L2,0,Platform'); // kept, though it has no outline
    expect(download['stops.txt']).not.toContain('OLD'); // stops come from the workspace
  });

  it('builds the same files for a Download as for Export to TDEI', async () => {
    const tdeiClient = fakeTdeiClient();
    await new TdeiExporter(tdeiClient as any, osmClient, new TdeiExporterContext())._exportPathwaysToTdei(workspace, {}, undefined);
    const uploaded = await read((tdeiClient.uploadPathwaysDataset.mock.calls[0] as unknown[])[3] as Blob);
    expect((tdeiClient.uploadPathwaysDataset.mock.calls[0] as unknown[])[0]).toBe('D1'); // derived from it

    const download = await read(await new WorkspacesClient('http://api.test/', 'http://api.test/', fakeTdeiClient() as any, osmClient)
      .exportWorkspaceArchive(workspace));
    expect(download).toEqual(uploaded);
  });
});

describe('original level names', () => {
  it('keeps the original level_name when an outline has none', async () => {
    const original = 'level_id,level_index,level_name\nN12_L0,0,Street\n';
    const { levels } = await exportFeed(
      [{ type: 'way', id: 5, nodes: [11, 12, 13, 11], tags: { level_id: 'N12_L0', level_index: '0' } }],
      new Map([['levels.txt', original]])
    );
    expect(levels).toEqual([{ level_id: 'N12_L0', level_index: '0', level_name: 'Street' }]);
  });
});

describe('buildPathwaysCsvArchive with edge cases', () => {
  const node = (id: number, tags?: Record<string, string>, lat = 38.9, lon = -77.0) => ({ type: 'node', id, lat, lon, ...(tags ? { tags } : {}) });
  const way = (id: number, nodes: number[], tags?: Record<string, string>) => ({ type: 'way', id, nodes, ...(tags ? { tags } : {}) });

  it('exports edge-case data without crashing', async () => {
    const elements: any[] = [
      node(1, { location_type: '1', stop_id: 'STN_N06', stop_name: 'Wiehle' }),
      node(2, { location_type: '0', stop_id: 'PF_N06_C', parent_station: 'STN_N06', level_id: 'N06_L2' }),
      node(3, { location_type: '2', stop_id: 'ENT_N06_N', parent_station: 'STN_N06', level_id: 'N06_L1' }),
      node(4, { location_type: '3', stop_id: 'NODE_N06_MZ', parent_station: 'STN_N06', level_id: 'N06_L1' }),
      node(5, { location_type: '4', parent_station: 'PF_N06_C', level_id: 'N06_L2' }), // boarding area via platform
      node(6, { location_type: '4', parent_station: 'NOPE' }), // dangling
      node(7, { location_type: '0', parent_station: 'STN_MISSING' }), // station not loaded
      node(8, { location_type: '1' }), // station without stop_id
      node(9, { location_type: '3', parent_station: '' }),
      node(10), node(11), node(12), node(13), node(14),
      way(20, [3, 10, 4], { pathway_mode: '1', is_bidirectional: '1', pathway_id: 'N06_1' }),
      way(21, [4, 2], { pathway_mode: '2', is_bidirectional: '1' }),
      way(22, [5, 99], { pathway_mode: '1', is_bidirectional: '1' }), // end node missing from the data
      way(23, [11, 12, 13, 14, 11], { area: 'yes', level_id: 'N06_L1', level_index: '1', level_name: 'Mezz' }),
      way(24, [11, 12, 13, 14, 11], { level_index: '0' }),
      way(25, [10]) // one node
    ];
    const original = new Map([
      ['levels.txt', 'level_id,level_index,level_name\nN06_L1,1,Mezzanine\nN06_L2,0,Platform\n'],
      ['agency.txt', 'agency_id,agency_name\nWMATA,Metro\n']
    ]);
    await expect(buildPathwaysCsvArchive(elements, original)).resolves.toBeInstanceOf(Blob);
    await expect(buildPathwaysCsvArchive(elements)).resolves.toBeInstanceOf(Blob);
  });
});

describe('exporting with an agency feed', () => {
  // The agency's feed: station S with an old entrance, generic node and pathway
  // the workspace redraws, a platform trips stop at, and another station T.
  const feedFiles = () => new Map([
    ['agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\nST,Sound Transit,https://st.org,America/Los_Angeles\n'],
    ['routes.txt', 'route_id,route_type\n1,1\n'],
    ['trips.txt', 'route_id,service_id,trip_id\n1,WK,T1\n'],
    ['calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20260101,20261231\n'],
    ['stop_times.txt', 'trip_id,stop_id,stop_sequence\nT1,PF_S,1\nT1,PF_T,2\n'],
    ['stops.txt', [
      'stop_id,stop_name,location_type,parent_station,zone_id',
      'S,Station S,1,,',
      'PF_S,Platform S,0,S,Z1',
      'ENT_OLD,Old entrance,2,S,',
      'N_OLD,Old node,3,S,',
      'T,Station T,1,,',
      'PF_T,Platform T,0,T,Z2',
      'ENT_T,Entrance T,2,T,'
    ].join('\n') + '\n'],
    ['pathways.txt', 'pathway_id,from_stop_id,to_stop_id,pathway_mode,is_bidirectional\nOLD_1,ENT_OLD,N_OLD,1,1\nT_1,ENT_T,PF_T,1,1\n']
  ]);

  // The workspace (e.g. from pathways-converter): station S, its platform (moved), a new entrance and a pathway.
  const elements = [
    node(1, { location_type: '1', stop_id: 'S', stop_name: 'Station S' }),
    node(2, { location_type: '0', stop_id: 'PF_S', stop_name: 'Platform S', parent_station: 'S', level_id: 'S_L1' }),
    node(3, { location_type: '2', stop_id: 'ENT_S_1', stop_name: 'Station S entrance', parent_station: 'S', level_id: 'S_L0' }),
    way(10, [3, 2], { pathway_id: 'S_0001', pathway_mode: '1', is_bidirectional: '1' })
  ];

  it('reads a feed zipped in a folder, and names the files TDEI needs that it lacks', async () => {
    const zip = await createGtfsArchive(new Map([...feedFiles()].map(([name, csv]) => [`google_transit/${name}`, csv])));
    const feed = await openAgencyFeed(zip);

    expect([...feed.keys()].sort()).toEqual(['agency.txt', 'calendar.txt', 'pathways.txt', 'routes.txt', 'stop_times.txt', 'stops.txt', 'trips.txt']);
    expect(missingFeedFiles(feed)).toEqual([]);
    feed.delete('trips.txt');
    feed.delete('calendar.txt');
    expect(missingFeedFiles(feed)).toEqual(['trips.txt', 'calendar.txt or calendar_dates.txt']);
    feed.set('calendar_dates.txt', 'service_id,date,exception_type\n');
    expect(missingFeedFiles(feed)).toEqual(['trips.txt']);
  });

  it('replaces the stops and pathways of the stations the workspace covers, and keeps the rest', () => {
    const agencyStops = [
      { stop_id: 'S', location_type: '1' },
      { stop_id: 'PF_S', location_type: '0', parent_station: 'S' },
      { stop_id: 'BA_OLD', location_type: '4', parent_station: 'PF_S' },
      { stop_id: 'N_OLD', location_type: '3', parent_station: 'S' },
      { stop_id: 'T', location_type: '1' },
      { stop_id: 'N_T', location_type: '3', parent_station: 'T' }
    ];
    const agencyPathways = [
      { pathway_id: 'OLD_1', from_stop_id: 'N_OLD', to_stop_id: 'PF_S' },
      { pathway_id: 'T_1', from_stop_id: 'N_T', to_stop_id: 'T' },
      { pathway_id: 'S_0001', from_stop_id: 'T', to_stop_id: 'N_T' } // same pathway_id as the workspace's
    ];
    const merged = mergeIntoAgencyFeed(agencyStops, agencyPathways,
      [{ stop_id: 'PF_S', location_type: '0', parent_station: 'S', level_id: 'L1' }],
      [{ pathway_id: 'S_0001', from_stop_id: 'PF_S', to_stop_id: 'PF_S' }]);

    expect(merged.stops.map(stop => stop.stop_id)).toEqual(['S', 'T', 'N_T', 'PF_S']); // BA_OLD and N_OLD were S's
    expect(merged.stops.at(-1)).toMatchObject({ level_id: 'L1' }); // the workspace's version
    expect(merged.pathways.map(pathway => pathway.pathway_id)).toEqual(['T_1', 'S_0001']);
  });

  it('exports to TDEI on the agency feed when the workspace isn\'t from a TDEI dataset', async () => {
    const tdeiClient = { getDatasetInfo: vi.fn(), uploadPathwaysDataset: vi.fn(async () => 'job-1') };
    const osmClient = { getWorkspaceData: vi.fn(async () => elements) } as any;
    const exporter = new TdeiExporter(tdeiClient as any, osmClient, new TdeiExporterContext());
    const workspace = { id: 8, type: 'pathways', tdeiServiceId: 'S1', tdeiProjectGroupId: 'PG' } as any;

    await exporter._exportPathwaysToTdei(workspace, {}, undefined, feedFiles());

    const [derivedFrom, , , zip] = tdeiClient.uploadPathwaysDataset.mock.calls[0] as unknown as [unknown, unknown, unknown, Blob];
    expect(derivedFrom).toBeUndefined();
    const files = await openTdeiPathwaysArchive(zip, true, false);
    expect((files.get('stop_times.txt') as Row[]).map(row => row.stop_id)).toEqual(['PF_S', 'PF_T']);
    expect((files.get('agency.txt') as Row[])[0]!.agency_name).toBe('Sound Transit');
    expect((files.get('stops.txt') as Row[]).map(row => row.stop_id).sort())
      .toEqual(['ENT_S_1', 'ENT_T', 'PF_S', 'PF_T', 'S', 'T']); // ENT_OLD and N_OLD replaced
    expect((files.get('stops.txt') as Row[]).find(row => row.stop_id === 'PF_T')!.zone_id).toBe('Z2');
    expect((files.get('pathways.txt') as Row[]).map(row => row.pathway_id)).toEqual(['T_1', 'S_0001']);
  });

  it('keeps locations.geojson, which a GTFS-Flex stop_times.txt may refer to', async () => {
    const zip = await createGtfsArchive(new Map([...feedFiles(), ['locations.geojson', '{"type":"FeatureCollection","features":[]}'], ['readme.md', 'notes']]));
    const feed = await openAgencyFeed(zip);

    expect(feed.get('locations.geojson')).toContain('FeatureCollection');
    expect(feed.has('readme.md')).toBe(false);
  });

  it('gives a new feature an ID the agency doesn\'t use, so it can\'t replace an agency stop by accident', async () => {
    // The agency has platform PF_S_1, which the workspace doesn't; a platform drawn in the
    // editor (no stop_id) in station S would otherwise be numbered PF_S_1 too.
    const files = feedFiles();
    files.set('stops.txt', files.get('stops.txt')!.replace('PF_S,Platform S,0,S,Z1', 'PF_S_1,Platform S,0,S,Z1'));
    const drawn = [elements[0]!, node(4, { location_type: '0', parent_station: 'S', level_id: 'S_L1' })];

    const stops = await openTdeiPathwaysArchive(await buildPathwaysCsvArchive(drawn, files, { mergeWithFeed: true }), true, false)
      .then(archive => archive.get('stops.txt') as Row[]);

    expect(stops.find(stop => stop.stop_id === 'PF_S_1')!.stop_name).toBe('Platform S'); // the agency's, kept
    expect(stops.filter(stop => stop.parent_station === 'S' && stop.location_type === '0').map(stop => stop.stop_id))
      .toEqual(['PF_S_1', 'PF_S_2']);
  });

  it('refuses to export to TDEI with neither the original dataset nor an agency feed', async () => {
    const tdeiClient = { getDatasetInfo: vi.fn(async () => undefined), uploadPathwaysDataset: vi.fn() };
    const osmClient = { getWorkspaceData: vi.fn(async () => elements) } as any;
    const exporter = new TdeiExporter(tdeiClient as any, osmClient, new TdeiExporterContext());

    await expect(exporter._exportPathwaysToTdei({ id: 8, type: 'pathways', tdeiServiceId: 'S1', tdeiProjectGroupId: 'PG' } as any, {}))
      .rejects.toThrow('wasn\'t made from a TDEI dataset');
    await expect(exporter._exportPathwaysToTdei({ id: 8, type: 'pathways', tdeiRecordId: 'GONE', tdeiServiceId: 'S1', tdeiProjectGroupId: 'PG' } as any, {}))
      .rejects.toThrow('no longer exists');
    expect(tdeiClient.uploadPathwaysDataset).not.toHaveBeenCalled();
  });
});
