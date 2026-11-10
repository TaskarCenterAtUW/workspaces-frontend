import { describe, expect, it } from 'vitest';

import { applyResolutions, findDanglingReferences } from '~/services/merge';
import { OsmElementLookup } from '~/util/osm';

import { osmNode, osmRelation, osmWay } from '../../mocks/osm-elements';

describe('applyResolutions reference repair', () => {
  it('restores the vertices of a way the user chose to keep', () => {
    // Deleting a line in the editor deletes its untagged vertices too. When
    // the other side edited that line, the vertices are dropped as an
    // uncontested deletion while the line becomes a conflict, so keeping the
    // line would leave it pointing at nothing and the upload would be refused.
    const ancestor = new OsmElementLookup([
      osmNode(1), osmNode(2), osmWay(10, [1, 2])
    ]);

    const conflict = {
      number: 1,
      kind: 'deleted-in-a' as const,
      type: 'way' as const,
      elementId: 10,
      a: osmWay(10, [1, 2]),
      b: osmWay(10, [1, 2], { version: 2, tags: { surface: 'asphalt' } }),
      base: osmWay(10, [1, 2]),
      geometryConflict: false,
      tagConflicts: [],
      mergedTags: { surface: 'asphalt' }
    };

    const output = applyResolutions(
      new OsmElementLookup(),
      [conflict],
      [{ resolved: true, chosenSide: 'b', tags: { surface: 'asphalt' } }],
      ancestor
    );

    expect(output.has('way', 10)).toBe(true);
    expect(output.has('node', 1)).toBe(true);
    expect(output.has('node', 2)).toBe(true);
    expect(findDanglingReferences(output)).toEqual([]);
  });

  it('follows references the restored elements themselves add', () => {
    const ancestor = new OsmElementLookup([
      osmNode(1), osmWay(10, [1]), osmRelation(20, [{ type: 'way', ref: 10, role: '' }])
    ]);

    const conflict = {
      number: 1,
      kind: 'deleted-in-a' as const,
      type: 'relation' as const,
      elementId: 20,
      a: osmRelation(20, [{ type: 'way', ref: 10, role: '' }]),
      b: osmRelation(20, [{ type: 'way', ref: 10, role: '' }], { version: 2 }),
      base: osmRelation(20, [{ type: 'way', ref: 10, role: '' }]),
      geometryConflict: false,
      tagConflicts: [],
      mergedTags: { }
    };

    const output = applyResolutions(
      new OsmElementLookup(),
      [conflict],
      [{ resolved: true, chosenSide: 'b', tags: { } }],
      ancestor
    );

    // The relation pulls back the way, which in turn pulls back its node:
    expect(output.has('way', 10)).toBe(true);
    expect(output.has('node', 1)).toBe(true);
    expect(findDanglingReferences(output)).toEqual([]);
  });

  it('leaves a reference the ancestor cannot supply for the caller to report', () => {
    const conflict = {
      number: 1,
      kind: 'both-modified' as const,
      type: 'way' as const,
      elementId: 10,
      a: osmWay(10, [1, 77], { version: 2 }),
      b: osmWay(10, [1, 77], { version: 2 }),
      base: osmWay(10, [1, 77]),
      geometryConflict: false,
      tagConflicts: [],
      mergedTags: { }
    };

    const output = applyResolutions(
      new OsmElementLookup([osmNode(1)]),
      [conflict],
      [{ resolved: true, chosenSide: 'a', tags: { } }],
      new OsmElementLookup([osmNode(1)])
    );

    expect(findDanglingReferences(output)).toEqual(['way 10 references node 77']);
  });

  it('does not resurrect an element the user chose to delete', () => {
    // The kept way still references the deleted node, so the restore pass
    // would otherwise put the ancestor's copy back, reversing the user's
    // decision silently, and at the pre-import position.
    const ancestor = new OsmElementLookup([
      osmNode(5, { lat: 47.6 }), osmNode(6), osmWay(1, [5, 6])
    ]);

    const nodeConflict = {
      number: 1,
      kind: 'deleted-in-b' as const,
      type: 'node' as const,
      elementId: 5,
      a: osmNode(5, { lat: 47.7, version: 2 }),
      b: osmNode(5, { lat: 47.6 }),
      base: osmNode(5, { lat: 47.6 }),
      geometryConflict: false,
      tagConflicts: [],
      mergedTags: { }
    };

    const wayConflict = {
      number: 2,
      kind: 'deleted-in-b' as const,
      type: 'way' as const,
      elementId: 1,
      a: osmWay(1, [5, 6], { version: 2 }),
      b: osmWay(1, [5, 6]),
      base: osmWay(1, [5, 6]),
      geometryConflict: false,
      tagConflicts: [],
      mergedTags: { }
    };

    const output = applyResolutions(
      new OsmElementLookup(),
      [nodeConflict, wayConflict],
      [
        { resolved: true, chosenSide: 'delete', tags: { } },
        { resolved: true, chosenSide: 'a', tags: { } }
      ],
      ancestor
    );

    expect(output.has('node', 5)).toBe(false);

    // The contradiction is reported rather than silently healed:
    expect(findDanglingReferences(output)).toContain('way 1 references node 5');
  });
});

describe('findDanglingReferences', () => {
  it('names a way whose node the merge does not contain', () => {
    const elements = new OsmElementLookup([osmNode(1), osmWay(10, [1, 2])]);

    expect(findDanglingReferences(elements)).toEqual(['way 10 references node 2']);
  });

  it('names a relation whose member the merge does not contain', () => {
    const elements = new OsmElementLookup([
      osmRelation(5, [{ type: 'way', ref: 99, role: 'outer' }])
    ]);

    expect(findDanglingReferences(elements))
      .toEqual(['relation 5 references way 99']);
  });

  it('reports nothing when every reference resolves', () => {
    const elements = new OsmElementLookup([
      osmNode(1),
      osmNode(2),
      osmWay(10, [1, 2]),
      osmRelation(5, [{ type: 'way', ref: 10, role: 'outer' }])
    ]);

    expect(findDanglingReferences(elements)).toEqual([]);
  });
});
