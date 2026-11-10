import { describe, expect, it } from 'vitest';

import { applyResolutions } from '~/services/merge';
import { OsmElementLookup } from '~/util/osm';

import { osmNode } from '../../mocks/osm-elements';

import type { ConflictResolution } from '~/services/merge';
import type { OsmNode } from '~/types/osm';

describe('applyResolutions', () => {
  function conflictFixture() {
    return {
      number: 1,
      kind: 'both-modified' as const,
      type: 'node' as const,
      elementId: 1,
      a: osmNode(1, { lat: 10, lon: 10, version: 2, tags: { highway: 'footway', surface: 'asphalt' } }),
      b: osmNode(1, { lat: 20, lon: 20, version: 2, tags: { highway: 'footway', surface: 'concrete' } }),
      geometryConflict: true,
      tagConflicts: ['surface'],
      mergedTags: { highway: 'footway', surface: 'asphalt' }
    };
  }

  it('puts the chosen side back into the merged set', () => {
    const conflict = conflictFixture();
    const resolution: ConflictResolution = {
      resolved: true,
      chosenSide: 'b',
      tags: { highway: 'footway', surface: 'concrete' }
    };

    const output = applyResolutions(new OsmElementLookup(), [conflict], [resolution]);

    expect((output.get('node', 1) as OsmNode).lat).toBe(20);
  });

  it('keeps tags neither side disputed', () => {
    // A resolution that only picks a geometry must not strip highway=footway
    // off the element.
    const conflict = conflictFixture();
    const resolution: ConflictResolution = {
      resolved: true,
      chosenSide: 'a',
      tags: { ...conflict.mergedTags }
    };

    const output = applyResolutions(new OsmElementLookup(), [conflict], [resolution]);

    expect(output.get('node', 1)!.tags).toEqual({
      highway: 'footway',
      surface: 'asphalt'
    });
  });

  it('leaves the element out when the user honors a deletion', () => {
    const conflict = { ...conflictFixture(), kind: 'deleted-in-a' as const };
    const resolution: ConflictResolution = {
      resolved: true,
      chosenSide: 'delete',
      tags: { }
    };

    const output = applyResolutions(
      new OsmElementLookup([osmNode(1, { lat: 0, lon: 0, version: 1 })]),
      [conflict],
      [resolution]
    );

    expect(output.has('node', 1)).toBe(false);
  });

  it('refuses to build a result from an unresolved conflict', () => {
    const resolution: ConflictResolution = {
      resolved: false,
      chosenSide: null,
      tags: { }
    };

    expect(() => applyResolutions(
      new OsmElementLookup(),
      [conflictFixture()],
      [resolution]
    )).toThrow(/has not been resolved/);
  });

  it('does not disturb the elements it was given', () => {
    const elements = new OsmElementLookup([osmNode(2, { lat: 1, lon: 1, version: 1, tags: { a: 'b' } })]);
    const conflict = conflictFixture();

    applyResolutions(elements, [conflict], [{
      resolved: true,
      chosenSide: 'a',
      tags: { surface: 'asphalt' }
    }]);

    expect(elements.has('node', 1)).toBe(false);
    expect(elements.get('node', 2)!.tags).toEqual({ a: 'b' });
  });
});

describe('applyResolutions geometry handling', () => {
  it('keeps a one-sided geometry edit when only the tags are disputed', () => {
    // checkGeometryConflict already settled the shape: only B moved it. Taking
    // the chosen side's element wholesale would silently revert that move,
    // and the UI shows no geometry control when geometryConflict is false.
    const conflict = {
      number: 1,
      kind: 'both-modified' as const,
      type: 'node' as const,
      elementId: 1,
      a: osmNode(1, { lat: 1, lon: 2, version: 2, tags: { surface: 'asphalt' } }),
      b: osmNode(1, { lat: 9.9, lon: 8.8, version: 2, tags: { surface: 'concrete' } }),
      base: osmNode(1, { lat: 1, lon: 2, tags: { surface: 'gravel' } }),
      geometryConflict: false,
      tagConflicts: ['surface'],
      mergedTags: { surface: 'asphalt' }
    };

    const output = applyResolutions(new OsmElementLookup(), [conflict], [{
      resolved: true,
      chosenSide: 'a',
      tags: { surface: 'concrete' }
    }]);

    const node = output.get('node', 1) as OsmNode;

    expect([node.lat, node.lon]).toEqual([9.9, 8.8]);
    expect(node.tags).toEqual({ surface: 'concrete' });
  });

  it('takes the chosen side outright when the geometry really is disputed', () => {
    const conflict = {
      number: 1,
      kind: 'both-modified' as const,
      type: 'node' as const,
      elementId: 1,
      a: osmNode(1, { lat: 10, lon: 10, version: 2 }),
      b: osmNode(1, { lat: 20, lon: 20, version: 2 }),
      base: osmNode(1, { lat: 0, lon: 0 }),
      geometryConflict: true,
      tagConflicts: [],
      mergedTags: { }
    };

    const output = applyResolutions(new OsmElementLookup(), [conflict], [{
      resolved: true,
      chosenSide: 'b',
      tags: { }
    }]);

    expect((output.get('node', 1) as OsmNode).lat).toBe(20);
  });
});
