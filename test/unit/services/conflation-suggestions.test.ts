import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlobReader, BlobWriter, configure, TextReader, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import { Ds2Data, ds1FromWays, readOswArchive, tileAt, tileBounds, tilesFor } from '~/services/conflation/inputs';
import { REMOVAL_REASONS, tileRemoved, tileSuggestions, toTags } from '~/services/conflation/suggestions';
import type { Bounds, EdgeSuggestion, TagSuggestion } from '~/services/conflation/suggestions';
import { unionDatasets } from '~/services/conflation/union';
import type { UnionDataset } from '~/services/conflation/union';

// zip.js would otherwise start web workers, which the test environment lacks.
configure({ useWebWorkers: false });

const FIXTURES = join(__dirname, '../fixtures/union-harness');
const read = (name: string) => JSON.parse(readFileSync(join(FIXTURES, `${name}.geojson`), 'utf8'));

// DS1 as the workspace would have it (OSM ids), DS2 as a TDEI dataset.
const DS1: UnionDataset = {
  nodes: read('ds1_nodes').features.map((f: any) => ({ id: `n${f.properties._id}`, loc: f.geometry.coordinates, props: f.properties })),
  edges: read('ds1_edges').features.map((f: any) => ({ id: `w${f.properties._id}`, coords: f.geometry.coordinates, props: f.properties }))
};
const DS2 = new Ds2Data({ nodes: read('ds2_nodes').features, edges: read('ds2_edges').features }, 'tdei');
const EVERYWHERE: Bounds = [-180, -90, 180, 90];

const result = unionDatasets(DS1, DS2.window(EVERYWHERE), { proximity: 1, centreLat: 44.63 });
const ds1Tags = new Map(DS1.nodes.map(n => [n.id, toTags(n.props)]));
const suggestions = tileSuggestions(result, EVERYWHERE, ds1Tags, 'test');
const edgesNamed = (name: string) => suggestions.filter((s): s is EdgeSuggestion => s.kind === 'edge' && s.tags.name === name);

describe('tileSuggestions', () => {
  it('suggests nothing for a TDEI edge that duplicates workspace data (case A)', () => {
    expect(edgesNamed('A: duplicate sidewalk')).toEqual([]);
  });

  it('suggests the tags a TDEI node adds to the workspace node it snapped onto, with the union\'s tags for display (case A)', () => {
    const tags = suggestions.filter((s): s is TagSuggestion => s.kind === 'tags' && s.nodeId === 'n1000001');
    expect(tags).toHaveLength(1);
    expect(tags[0]!.addTags).toEqual({ 'ext:surface': 'concrete' }); // tactile_paving stays the workspace's "no"
    expect(tags[0]!.unionTags['ext:union_audit_tactile_paving']).toBe('tdei:n:2000001-yes');
    expect(tags[0]!.unionTags['ext:union_confidence_status']).toBe('merged');
  });

  it('connects a TDEI edge to the workspace node it snapped onto (case H)', () => {
    const [east] = edgesNamed('H: sidewalk east');
    const ends = [east!.u, east!.v];
    expect(ends.some(e => e.kind === 'existing' && e.splitWays.length === 0)).toBe(true);
  });

  it('inserts a T-junction node into the workspace way it meets, splitting it there (case G)', () => {
    const [stub] = edgesNamed('G: short T stub');
    const longSidewalk = DS1.edges.find(e => e.props.name === 'G: long sidewalk')!.id;
    const joined = [stub!.u, stub!.v].find(e => e.kind === 'new' && e.insertInto.length);
    expect(joined).toMatchObject({ kind: 'new', insertInto: [longSidewalk] });
  });

  it('adds the intersection node a TDEI crossing makes with a workspace road, splitting the road (case C)', () => {
    const pieces = edgesNamed('C: crossing');
    expect(pieces).toHaveLength(2);
    const shared = pieces.flatMap(p => [p.u, p.v]).filter(e => e.kind === 'new' && e.unionId.startsWith('ixn-'));
    expect(shared).toHaveLength(2);
    expect(shared[0]).toMatchObject({ tags: {}, insertInto: [expect.stringMatching(/^w/)] }); // union metadata isn't written
  });

  it('lists the TDEI edges the union dropped, saying why (cases A and B)', () => {
    const removed = tileRemoved(result, EVERYWHERE, 'test');
    const named = (name: string) => removed.filter(r => r.tags.name === name);
    expect(named('A: duplicate sidewalk').map(r => r.tags['ext:union_removed'])).toEqual([REMOVAL_REASONS.node_pair_duplicate]);
    expect(named('B: drifting sidewalk').map(r => r.reason)).toEqual([expect.stringMatching(/_duplicate$/)]);
    expect(named('I: DS2-only service road')).toEqual([]);   // kept, so not listed
    expect(new Set(removed.map(r => r.id)).size).toBe(removed.length);
  });

  it('writes OSM string tags without OSW ids', () => {
    expect(toTags({ _id: '1', _u_id: '2', width: 1.5, incline: null, name: 'x' })).toEqual({ width: '1.5', name: 'x' });
  });

  it('gives each suggestion to exactly one of two tiles that split an area', () => {
    const [w, s, e, n] = DS2.bounds;
    const mid = (w + e) / 2;
    const west = tileSuggestions(result, [w - 1, s - 1, mid, n + 1], ds1Tags, 'test');
    const east = tileSuggestions(result, [mid, s - 1, e + 1, n + 1], ds1Tags, 'test');
    const ids = [...west, ...east].map(x => x.id).sort();
    expect(ids).toEqual(suggestions.map(x => x.id).sort());
  });
});

describe('conflation inputs', () => {
  it('windows a TDEI dataset to whole edges touching the area, with their nodes', () => {
    const windowed = DS2.window([-123.1, 44.6299, -123.0995, 44.6301]);
    expect(windowed.edges.map(e => e.props.name)).toContain('A: duplicate sidewalk');
    const coords = new Set(windowed.nodes.map(n => n.loc.join()));
    for (const edge of windowed.edges) {
      expect(coords.has(edge.coords[0]!.join())).toBe(true);
    }
  });

  it('takes workspace lines with a highway tag as DS1, leaving out areas', () => {
    const node = (id: string, x: number) => ({ id, loc: [x, 0] as [number, number], tags: {} });
    const ds1 = ds1FromWays([
      { id: 'w1', tags: { highway: 'footway' }, nodes: [node('n1', 0), node('n2', 1)] },
      { id: 'w2', tags: { building: 'yes' }, nodes: [node('n3', 0), node('n4', 1)] },
      { id: 'w3', tags: { highway: 'pedestrian', area: 'yes' }, nodes: [node('n5', 0), node('n6', 1), node('n7', 2), node('n5', 0)] }
    ]);
    expect(ds1.edges.map(e => e.id)).toEqual(['w1']);
    expect(ds1.nodes.map(n => n.id)).toEqual(['n1', 'n2']);
  });

  it('reads nodes and edges from a TDEI OSW zip, nested or not', async () => {
    const geojson = (features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features });
    const inner = new ZipWriter(new BlobWriter('application/zip'));
    await inner.add('x.nodes.geojson', new TextReader(geojson([{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { _id: 'a' } }])));
    await inner.add('x.edges.geojson', new TextReader(geojson([])));
    const innerBlob = await inner.close();
    const outer = new ZipWriter(new BlobWriter('application/zip'));
    await outer.add('dataset.zip', new BlobReader(innerBlob));
    await outer.add('metadata.json', new TextReader('{}'));

    for (const blob of [innerBlob, await outer.close()]) {
      const data = await readOswArchive(blob);
      expect(data.nodes).toHaveLength(1);
      expect(data.edges).toEqual([]);
    }
  });

  it('finds the z16 tiles covering an area, and their bounds', () => {
    const xy = tileAt([-123.1, 44.63], 16);
    const [w, s, e, n] = tileBounds(xy, 16);
    expect(-123.1).toBeGreaterThanOrEqual(w);
    expect(-123.1).toBeLessThan(e);
    expect(44.63).toBeGreaterThanOrEqual(s);
    expect(44.63).toBeLessThan(n);
    expect(tilesFor([w + 1e-9, s + 1e-9, e - 1e-9, n - 1e-9], 16)).toEqual([xy]);
  });
});
