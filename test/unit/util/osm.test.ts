import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';

import { osmNode, osmRelation, osmWay } from '../../mocks/osm-elements';

import {
  copyOsmElement,
  editorHashFor,
  editorRoute,
  geometryEqual,
  mapHash,
  newerOsmElement,
  OsmElementLookup,
  wayToGeoJsonCoords
} from '~/util/osm';

describe('geometryEqual', () => {
  it('ignores tags', () => {
    expect(geometryEqual(
      osmNode(1, { tags: { a: 'b' } }),
      osmNode(1, { tags: { c: 'd' } })
    )).toBe(true);
  });

  it('compares node coordinates', () => {
    expect(geometryEqual(osmNode(1), osmNode(1, { lat: 47.9 }))).toBe(false);
  });

  it('compares way node lists in order', () => {
    expect(geometryEqual(osmWay(1, [1, 2]), osmWay(1, [1, 2]))).toBe(true);
    expect(geometryEqual(osmWay(1, [1, 2]), osmWay(1, [2, 1]))).toBe(false);
  });

  it('compares relation members', () => {
    const members = [{ type: 'way' as const, ref: 1, role: 'outer' }];

    expect(geometryEqual(osmRelation(1, members), osmRelation(1, [...members]))).toBe(true);
    expect(geometryEqual(
      osmRelation(1, members),
      osmRelation(1, [{ type: 'way', ref: 2, role: 'outer' }])
    )).toBe(false);
  });

  it('treats different element types as unequal', () => {
    expect(geometryEqual(osmNode(1), osmWay(1, [2]))).toBe(false);
  });
});

describe('newerOsmElement', () => {
  it('picks the element with the later timestamp', () => {
    const older = osmNode(1, { timestamp: new Date('2026-01-01T00:00:00Z') });
    const newer = osmNode(1, { timestamp: new Date('2026-06-01T00:00:00Z') });

    expect(newerOsmElement(older, newer)).toBe(newer);
    expect(newerOsmElement(newer, older)).toBe(newer);
  });
});

describe('copyOsmElement', () => {
  it('copies tags and node lists deeply', () => {
    const original = osmWay(1, [1, 2], { tags: { highway: 'footway' } });
    const copy = copyOsmElement(original);

    copy.nodes.push(3);
    copy.tags!.highway = 'path';

    expect(original.nodes).toEqual([1, 2]);
    expect(original.tags).toEqual({ highway: 'footway' });
  });

  it('copies relation members so roles can be edited independently', () => {
    const original = osmRelation(1, [{ type: 'way', ref: 5, role: 'outer' }]);
    const copy = copyOsmElement(original);

    copy.members[0]!.role = 'inner';

    expect(original.members[0]!.role).toBe('outer');
  });

  it('works on an element read back out of reactive state', () => {
    // structuredClone throws DataCloneError on a Proxy, and elements are
    // routinely read back out of Vue state.
    const proxied = reactive(osmNode(1, { tags: { a: 'b' } }));

    expect(() => copyOsmElement(proxied)).not.toThrow();
    expect(copyOsmElement(proxied).tags).toEqual({ a: 'b' });
  });
});

describe('OsmElementLookup', () => {
  it('iterates nodes, then ways, then relations', () => {
    // The osmChange builder depends on this order to resolve way and relation
    // references to the placeholders it assigns.
    const lookup = new OsmElementLookup([
      osmRelation(1, []),
      osmWay(1, [1]),
      osmNode(1)
    ]);

    expect([...lookup].map(e => e.type)).toEqual(['node', 'way', 'relation']);
  });

  it('keys separately per element type', () => {
    const lookup = new OsmElementLookup([osmNode(1), osmWay(1, [1])]);

    expect(lookup.get('node', 1)!.type).toBe('node');
    expect(lookup.get('way', 1)!.type).toBe('way');
    expect(lookup.size).toBe(2);
  });

  it('removes and reports membership by type and ID', () => {
    const lookup = new OsmElementLookup([osmNode(1)]);

    expect(lookup.has('node', 1)).toBe(true);
    lookup.remove('node', 1);
    expect(lookup.has('node', 1)).toBe(false);
  });

  it('stays usable after a round trip through reactive state', () => {
    // A reactive Proxy cannot forward #private field access, so a lookup built
    // on private fields throws TypeError on every method once it has been
    // stored in Vue state. The conflicts page stores its lookup this way.
    const state = reactive({
      lookup: new OsmElementLookup([osmNode(1), osmWay(2, [1])])
    });

    expect(() => state.lookup.get('node', 1)).not.toThrow();
    expect(state.lookup.get('node', 1)!.id).toBe(1);
    expect([...state.lookup]).toHaveLength(2);
    expect(() => new OsmElementLookup(state.lookup)).not.toThrow();
  });
});

describe('wayToGeoJsonCoords', () => {
  it('resolves each node reference to a coordinate pair', () => {
    const lookup = new OsmElementLookup([
      osmNode(1, { lat: 47.6, lon: -122.3 }),
      osmNode(2, { lat: 47.7, lon: -122.4 })
    ]);

    expect(wayToGeoJsonCoords(osmWay(9, [1, 2]), lookup)).toEqual([
      [-122.3, 47.6],
      [-122.4, 47.7]
    ]);
  });

  it('returns undefined when a node is missing rather than a shortcut line', () => {
    // Dropping the missing vertex would draw a straight line past it, which
    // reads as real geometry rather than as missing data.
    const lookup = new OsmElementLookup([osmNode(1), osmNode(3)]);

    expect(wayToGeoJsonCoords(osmWay(9, [1, 2, 3]), lookup)).toBeUndefined();
  });
});

describe('editorHashFor', () => {
  it('centres on the extent of the nodes at the lowest editable zoom', () => {
    const elements = [
      osmNode(1, { lat: 47.6, lon: -122.4 }),
      osmNode(2, { lat: 47.8, lon: -122.2 }),
      osmWay(9, [1, 2])
    ];

    const [zoom, lat, lon] = editorHashFor(elements)!.replace('#map=', '').split('/').map(Number);

    expect(zoom).toBe(16);
    expect(lat).toBeCloseTo(47.7);
    expect(lon).toBeCloseTo(-122.3);
  });

  it('treats zero as a real coordinate', () => {
    expect(editorHashFor([osmNode(1, { lat: 0, lon: 0 })])).toBe('#map=16/0/0');
  });

  it('returns undefined without nodes rather than a made-up position', () => {
    expect(editorHashFor([osmWay(9, [1, 2])])).toBeUndefined();
    expect(editorHashFor([])).toBeUndefined();
  });
});

describe('mapHash', () => {
  it('writes the view as zoom, latitude, longitude', () => {
    expect(mapHash({ zoom: 11.5, lat: 47.6, lon: -122.3 })).toBe('#map=11.5/47.6/-122.3');
  });
});

describe('editorRoute', () => {
  it('names the editor for the workspace type and opens it at the hash', () => {
    expect(editorRoute(99, 'osw', '#map=16/47.6/-122.3')).toEqual({
      path: '/workspace/99/edit',
      query: { datatype: 'osw' },
      hash: '#map=16/47.6/-122.3'
    });
  });

  it('leaves the hash out rather than inventing a view', () => {
    expect(editorRoute(99, 'pathways')).toEqual({
      path: '/workspace/99/edit',
      query: { datatype: 'pathways' }
    });
    expect(editorRoute(99, 'osw', undefined)).not.toHaveProperty('hash');
  });
});
