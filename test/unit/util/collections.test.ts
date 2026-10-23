import { describe, expect, it } from 'vitest';

import { shallowArrayEqual, shallowMembersEqual } from '~/util/collections';

import type { OsmRelationRef } from '~/types/osm';

describe('shallowArrayEqual', () => {
  it('compares element by element', () => {
    expect(shallowArrayEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(shallowArrayEqual([1, 2, 3], [1, 3, 2])).toBe(false);
  });

  it('treats a length difference as unequal', () => {
    expect(shallowArrayEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('treats two empty arrays as equal', () => {
    expect(shallowArrayEqual([], [])).toBe(true);
  });
});

describe('shallowMembersEqual', () => {
  const members: OsmRelationRef[] = [
    { type: 'way', ref: 1, role: 'outer' },
    { type: 'node', ref: 2, role: '' }
  ];

  it('compares type, ref and role of each member', () => {
    expect(shallowMembersEqual(members, members.map(m => ({ ...m })))).toBe(true);
  });

  it('is order sensitive, because member order is part of a relation', () => {
    expect(shallowMembersEqual(members, [...members].reverse())).toBe(false);
  });

  it('notices a changed role', () => {
    expect(shallowMembersEqual(members, [
      { type: 'way', ref: 1, role: 'inner' },
      { type: 'node', ref: 2, role: '' }
    ])).toBe(false);
  });

  it('notices a changed ref', () => {
    expect(shallowMembersEqual(members, [
      { type: 'way', ref: 99, role: 'outer' },
      { type: 'node', ref: 2, role: '' }
    ])).toBe(false);
  });

  it('notices a changed type', () => {
    expect(shallowMembersEqual(members, [
      { type: 'relation', ref: 1, role: 'outer' },
      { type: 'node', ref: 2, role: '' }
    ])).toBe(false);
  });

  it('treats two empty member lists as equal', () => {
    expect(shallowMembersEqual([], [])).toBe(true);
  });
});
