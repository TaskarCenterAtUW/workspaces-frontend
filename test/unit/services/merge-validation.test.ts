import { describe, expect, it } from 'vitest';

import { findImportMismatch, findUnusableTags } from '~/services/merge';
import { OsmElementLookup } from '~/util/osm';

import { osmNode, osmRelation, osmWay } from '../../mocks/osm-elements';

import type { OsmElement } from '~/types/osm';

describe('findUnusableTags', () => {
  function lookupWith(tags: Record<string, string>) {
    return new OsmElementLookup([osmNode(1, { tags })]);
  }

  it('passes tags the API will accept', () => {
    expect(findUnusableTags(lookupWith({ highway: 'crossing' }))).toEqual([]);
  });

  it('reports a value over the API limit', () => {
    const problems = findUnusableTags(lookupWith({ note: 'x'.repeat(256) }));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/longer than 255/);
    expect(problems[0]).toContain('node 1');
  });

  it('accepts a value exactly at the limit', () => {
    expect(findUnusableTags(lookupWith({ note: 'x'.repeat(255) }))).toEqual([]);
  });

  it('reports a key over the API limit', () => {
    expect(findUnusableTags(lookupWith({ ['k'.repeat(256)]: 'v' }))[0])
      .toMatch(/tag name/);
  });

  // The server counts characters. A surrogate pair is one character to it and
  // two units to `String.length`, so counting units would reject a value the
  // server accepts.
  it('counts code points, not UTF-16 units', () => {
    expect(findUnusableTags(lookupWith({ note: '😀'.repeat(255) }))).toEqual([]);
    expect(findUnusableTags(lookupWith({ note: '😀'.repeat(256) }))).toHaveLength(1);
  });

  // XML 1.0 cannot carry these even escaped, so the serializer emits a
  // document the server cannot parse, and its error names no tag.
  it('reports a control character a tag value cannot carry', () => {
    const problems = findUnusableTags(lookupWith({ note: 'before\u0001after' }));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/XML cannot carry/);
  });

  // A lone surrogate serializes, but fetch's UTF-8 encoder rewrites it to
  // U+FFFD, so the tag would upload corrupted rather than fail. A valid pair
  // (any astral character) must still be accepted.
  it('reports a lone surrogate but accepts a valid pair', () => {
    expect(findUnusableTags(lookupWith({ note: 'ab\uD800cd' }))).toHaveLength(1);
    expect(findUnusableTags(lookupWith({ note: 'ab\uDC00cd' }))).toHaveLength(1);
    expect(findUnusableTags(lookupWith({ note: 'ok \u{1F600} fine' }))).toEqual([]);
  });

  it('allows tab, newline and carriage return', () => {
    expect(findUnusableTags(lookupWith({ note: 'a\tb\nc\rd' }))).toEqual([]);
  });

  it('leaves an untagged element alone', () => {
    expect(findUnusableTags(new OsmElementLookup([osmNode(1)]))).toEqual([]);
  });

  // A member role is arbitrary data that reaches the serializer the same way a
  // tag value does, and the API caps it the same way.
  it('reports a relation member role over the API limit', () => {
    const problems = findUnusableTags(new OsmElementLookup([
      osmRelation(3, [{ type: 'way', ref: 10, role: 'r'.repeat(256) }])
    ]));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/relation 3: the role of way 10 is longer than 255/);
  });

  it('reports a relation member role XML cannot carry', () => {
    const problems = findUnusableTags(new OsmElementLookup([
      osmRelation(3, [{ type: 'node', ref: 4, role: 'in\u0001ner' }])
    ]));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/the role of node 4 contains a character XML cannot carry/);
  });

  it('accepts ordinary and empty relation member roles', () => {
    expect(findUnusableTags(new OsmElementLookup([
      osmRelation(3, [
        { type: 'way', ref: 10, role: 'outer' },
        { type: 'way', ref: 11, role: '' }
      ])
    ]))).toEqual([]);
  });
});

describe('findImportMismatch', () => {
  function lookup(elements: OsmElement[]) {
    return new OsmElementLookup(elements);
  }

  it('accepts two imports that created the same elements', () => {
    expect(findImportMismatch(
      lookup([osmNode(1), osmWay(2, [1])]),
      lookup([osmNode(1), osmWay(2, [1])])
    )).toBeUndefined();
  });

  // Two runs of the same import assign their own changeset ids, user ids and
  // timestamps, so comparing that metadata would refuse every legitimate merge.
  it('ignores changeset, user and timestamp differences', () => {
    expect(findImportMismatch(
      lookup([osmNode(1, { changeset: 1, uid: 7, timestamp: new Date('2026-01-01T00:00:00Z') })]),
      lookup([osmNode(1, { changeset: 99, uid: 42, timestamp: new Date('2026-06-30T12:00:00Z') })])
    )).toBeUndefined();
  });

  it('reports a different number of elements', () => {
    expect(findImportMismatch(lookup([osmNode(1)]), lookup([osmNode(1), osmNode(2)])))
      .toMatch(/created 1 and 2 elements/);
  });

  it('reports an id present in only one import', () => {
    expect(findImportMismatch(lookup([osmNode(1)]), lookup([osmNode(2)])))
      .toMatch(/node 1 exists in one import and not the other/);
  });

  it('reports a node that moved between imports', () => {
    expect(findImportMismatch(lookup([osmNode(1)]), lookup([osmNode(1, { lat: 47.9 })])))
      .toMatch(/node 1 is in a different place/);
  });

  it('reports a way whose node list differs', () => {
    expect(findImportMismatch(lookup([osmWay(2, [1, 3])]), lookup([osmWay(2, [1, 4])])))
      .toMatch(/way 2 is in a different place/);
  });

  // Tags are compared as well as geometry. An importer that leaves elements in
  // place but tags them differently has still broken the ID matching the merge
  // reads the ancestor by.
  it('reports an element whose tag value differs between imports', () => {
    expect(findImportMismatch(
      lookup([osmNode(1, { tags: { highway: 'crossing' } })]),
      lookup([osmNode(1, { tags: { highway: 'footway' } })])
    )).toMatch(/node 1 carries different tags/);
  });

  it('reports an element whose tag key differs between imports', () => {
    expect(findImportMismatch(
      lookup([osmNode(1, { tags: { highway: 'crossing' } })]),
      lookup([osmNode(1, { tags: { footway: 'crossing' } })])
    )).toMatch(/node 1 carries different tags/);
  });

  it('reports a tag only one import applied', () => {
    expect(findImportMismatch(
      lookup([osmNode(1, { tags: { highway: 'crossing' } })]),
      lookup([osmNode(1, { tags: { highway: 'crossing', surface: 'asphalt' } })])
    )).toMatch(/node 1 carries different tags/);
  });

  // The API omits `tags` entirely for an untagged element, which is every
  // vertex node in an import, so absent and empty have to read as the same.
  it('treats absent tags and an empty tag set as the same', () => {
    expect(findImportMismatch(
      lookup([osmNode(1)]),
      lookup([osmNode(1, { tags: { } })])
    )).toBeUndefined();
  });
});
