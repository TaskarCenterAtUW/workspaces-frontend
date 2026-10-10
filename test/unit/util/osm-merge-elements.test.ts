import { describe, expect, it } from 'vitest';

import { osmNode, osmRelation, osmWay } from '../../mocks/osm-elements';

import {
  checkConflict,
  checkGeometryConflict,
  mergeNodes,
  mergeOsmElements,
  mergeRelations,
  mergeWays
} from '~/util/osm-merge';

import type { OsmWay } from '~/types/osm';

describe('checkGeometryConflict', () => {
  it('compares way node lists and relation member lists', () => {
    expect(checkGeometryConflict(osmWay(1, [1, 2]), osmWay(1, [1, 3]))).toBe(true);
    expect(checkGeometryConflict(osmWay(1, [1, 2]), osmWay(1, [1, 2]))).toBe(false);

    const members = [{ type: 'way' as const, ref: 1, role: 'outer' }];

    expect(checkGeometryConflict(
      osmRelation(1, members),
      osmRelation(1, [...members])
    )).toBe(false);

    expect(checkGeometryConflict(
      osmRelation(1, members),
      osmRelation(1, [{ type: 'way', ref: 2, role: 'outer' }])
    )).toBe(true);
  });

  it('treats a base of a different element type as no common ancestor', () => {
    // A way cannot account for where a node sits, so the difference between
    // the two sides stays a conflict.
    expect(checkGeometryConflict(
      osmNode(1, { lat: 47.7 }),
      osmNode(1, { lat: 47.8 }),
      osmWay(1, [1, 2])
    )).toBe(true);
  });
});

describe('checkConflict', () => {
  it('finds no conflict when only one side moved a node', () => {
    const base = osmNode(1, { lat: 47.6 });

    expect(checkConflict(osmNode(1, { lat: 47.7 }), osmNode(1, { lat: 47.6 }), base)).toBe(false);
    expect(checkConflict(osmNode(1, { lat: 47.6 }), osmNode(1, { lat: 47.8 }), base)).toBe(false);
  });

  it('finds a conflict when both sides moved a node to different places', () => {
    const base = osmNode(1, { lat: 47.6 });

    expect(checkConflict(
      osmNode(1, { lat: 47.7 }),
      osmNode(1, { lat: 47.8 }),
      base
    )).toBe(true);
  });

  it('finds a conflict when the two sides are different element types', () => {
    expect(checkConflict(osmNode(1), osmWay(1, [2, 3]))).toBe(true);
  });

  it('finds a conflict from tags alone when the geometry matches', () => {
    const base = osmNode(1, { tags: { surface: 'gravel' } });

    expect(checkConflict(
      osmNode(1, { tags: { surface: 'asphalt' } }),
      osmNode(1, { tags: { surface: 'concrete' } }),
      base
    )).toBe(true);
  });

  it('finds a conflict when one side clears every tag and the other edits them', () => {
    const base = osmNode(1, { tags: { surface: 'gravel' } });

    expect(checkConflict(
      osmNode(1, { tags: { } }),
      osmNode(1, { tags: { surface: 'concrete' } }),
      base
    )).toBe(true);
  });
});

describe('mergeNodes', () => {
  it('takes the side that moved rather than averaging the two positions', () => {
    // Averaging invents a location neither surveyor recorded, which for a
    // crossing or kerb is a real positional error.
    const base = osmNode(1, { lat: 47.6, lon: -122.3 });
    const merged = mergeNodes(
      osmNode(1, { lat: 47.6, lon: -122.3 }),
      osmNode(1, { lat: 47.8, lon: -122.5 }),
      base
    );

    expect(merged.lat).toBe(47.8);
    expect(merged.lon).toBe(-122.5);
  });

  it('keeps the shared position when neither side moved', () => {
    const merged = mergeNodes(osmNode(1), osmNode(1));

    expect([merged.lat, merged.lon]).toEqual([47.6, -122.3]);
  });

  it('keeps the A-side position when the base is a different element type', () => {
    const merged = mergeNodes(
      osmNode(1, { lat: 47.7 }),
      osmNode(1, { lat: 47.8 }),
      osmWay(1, [1, 2])
    );

    expect([merged.lat, merged.lon]).toEqual([47.7, -122.3]);
  });
});

describe('mergeWays', () => {
  it('takes the node list from the side that changed it', () => {
    const base = osmWay(1, [1, 2, 3]);
    const merged = mergeWays(osmWay(1, [1, 2, 3]), osmWay(1, [1, 4, 3]), base);

    expect(merged.nodes).toEqual([1, 4, 3]);
  });

  it('keeps the A-side node list when only A changed it', () => {
    const base = osmWay(1, [1, 2, 3]);
    const merged = mergeWays(osmWay(1, [1, 9, 3]), osmWay(1, [1, 2, 3]), base);

    expect(merged.nodes).toEqual([1, 9, 3]);
  });

  it('merges tags from both sides while taking one side\'s geometry', () => {
    const base = osmWay(1, [1, 2], { tags: { highway: 'footway' } });
    const merged = mergeWays(
      osmWay(1, [1, 2], { tags: { highway: 'footway', surface: 'asphalt' } }),
      osmWay(1, [1, 2], { tags: { highway: 'footway', lit: 'yes' } }),
      base
    );

    expect(merged.tags).toEqual({
      highway: 'footway',
      surface: 'asphalt',
      lit: 'yes'
    });
  });

  it('copies the node list so the merged way does not alias its source', () => {
    const a = osmWay(1, [1, 2]);
    const merged = mergeWays(a, osmWay(1, [1, 2]));

    merged.nodes.push(3);

    expect(a.nodes).toEqual([1, 2]);
  });
});

describe('mergeRelations', () => {
  const outer = { type: 'way' as const, ref: 1, role: 'outer' };

  it('takes the member list from the side that changed it', () => {
    const base = osmRelation(1, [outer]);
    const changed = [outer, { type: 'way' as const, ref: 2, role: 'inner' }];
    const merged = mergeRelations(
      osmRelation(1, [{ ...outer }]),
      osmRelation(1, changed),
      base
    );

    expect(merged.members).toEqual(changed);
  });

  it('merges tags from both sides', () => {
    const base = osmRelation(1, [outer], { tags: { type: 'multipolygon' } });
    const merged = mergeRelations(
      osmRelation(1, [{ ...outer }], { tags: { type: 'multipolygon', name: 'Park' } }),
      osmRelation(1, [{ ...outer }], { tags: { type: 'multipolygon', access: 'yes' } }),
      base
    );

    expect(merged.tags).toEqual({
      type: 'multipolygon',
      name: 'Park',
      access: 'yes'
    });
  });

  it('copies each member so the merged relation does not alias its source', () => {
    const a = osmRelation(1, [{ ...outer }]);
    const merged = mergeRelations(a, osmRelation(1, [{ ...outer }]));

    merged.members[0]!.role = 'inner';

    expect(a.members[0]!.role).toBe('outer');
  });
});

describe('mergeOsmElements', () => {
  it('refuses to merge two different element types', () => {
    expect(() => mergeOsmElements(osmNode(1), osmWay(1, [2])))
      .toThrow(/type mismatch/);
  });

  it('copies the way node list instead of sharing it', () => {
    const a = osmWay(1, [1, 2]);
    const merged = mergeOsmElements(a, osmWay(1, [1, 2])) as OsmWay;

    merged.nodes.push(99);

    expect(a.nodes).toEqual([1, 2]);
  });
});
