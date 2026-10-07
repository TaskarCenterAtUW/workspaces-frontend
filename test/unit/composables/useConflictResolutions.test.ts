import { describe, expect, it } from 'vitest';

import { useConflictResolutions } from '~/composables/useConflictResolutions';

import { osmNode } from '../../mocks/osm-elements';

import type { MergeConflict } from '~/services/merge';

function conflict(overrides: Partial<MergeConflict> = { }): MergeConflict {
  return {
    number: 1,
    kind: 'both-modified',
    type: 'node',
    elementId: 1,
    a: osmNode(1, { lat: 10, version: 2, tags: { highway: 'footway', surface: 'asphalt' } }),
    b: osmNode(1, { lat: 20, version: 2, tags: { highway: 'footway', surface: 'concrete' } }),
    geometryConflict: true,
    tagConflicts: ['surface'],
    mergedTags: { highway: 'footway', surface: 'asphalt' },
    ...overrides
  };
}

// Vue's reactive proxy special-cases `hasOwnProperty`, and plain object
// literals inherit the rest, so a tag literally named one of these reads back
// as a function unless the maps are kept raw and read as own properties. Tag
// keys are arbitrary data: OSM reserves none.
//
// `__proto__` is the one that breaks differently. Reading it is not the
// problem, writing it is: assigning to `__proto__` on a plain object literal
// runs the inherited setter, which ignores a string, so the tag disappears
// instead of being stored.
const PROTOTYPE_KEYS = [
  'hasOwnProperty',
  'toString',
  'constructor',
  'valueOf',
  'isPrototypeOf',
  '__proto__'
];

function conflictOverKey(key: string): MergeConflict {
  return conflict({
    a: osmNode(1, { lat: 10, version: 2, tags: { [key]: 'from-a' } }),
    b: osmNode(1, { lat: 10, version: 2, tags: { [key]: 'from-b' } }),
    base: osmNode(1, { tags: { [key]: 'original' } }),
    geometryConflict: false,
    tagConflicts: [key],
    mergedTags: { [key]: 'from-a' }
  });
}

describe('useConflictResolutions with prototype-named tag keys', () => {
  it.each(PROTOTYPE_KEYS)('keepSide carries the real value for a tag named %s', (key) => {
    const { keepSide, resolutions } = useConflictResolutions([conflictOverKey(key)]);

    keepSide(0, 'b');

    expect(resolutions[0]!.tags[key]).toBe('from-b');
  });

  it.each(PROTOTYPE_KEYS)('setTag stores a real value for a tag named %s', (key) => {
    const { setTag, resolutions } = useConflictResolutions([conflictOverKey(key)]);

    setTag(0, key, 'typed-in');

    expect(resolutions[0]!.tags[key]).toBe('typed-in');
  });

  it('drops such a key when the kept side deleted it', () => {
    const { keepSide, resolutions } = useConflictResolutions([
      conflict({
        a: osmNode(1, { lat: 10, version: 2, tags: { } }),
        b: osmNode(1, { lat: 10, version: 2, tags: { hasOwnProperty: 'from-b' } }),
        base: osmNode(1, { tags: { hasOwnProperty: 'original' } }),
        geometryConflict: false,
        tagConflicts: ['hasOwnProperty'],
        mergedTags: { }
      })
    ]);

    keepSide(0, 'a');

    expect(Object.keys(resolutions[0]!.tags)).toEqual([]);
  });
});

describe('useConflictResolutions', () => {
  it('starts every conflict unresolved, seeded with the merged tags', () => {
    const { resolutions, unresolvedCount } = useConflictResolutions([conflict()]);

    expect(unresolvedCount.value).toBe(1);
    expect(resolutions[0]!.tags).toEqual({ highway: 'footway', surface: 'asphalt' });
  });

  it('needs only the tags settled when the geometry is not in dispute', () => {
    // The merge settles the geometry itself when only one side moved, so the
    // user is asked to pick a side only for the tags.
    const { resolutions } = useConflictResolutions([
      conflict({
        geometryConflict: false,
        a: osmNode(1, { lat: 10, version: 2, tags: { surface: 'asphalt' } }),
        b: osmNode(1, { lat: 10, version: 2, tags: { surface: 'concrete' } })
      })
    ]);

    expect(resolutions[0]!.chosenSide).toBe('a');
  });

  it('resolves a whole conflict when a side is kept', () => {
    const { keepSide, isResolved, resolutions } = useConflictResolutions([conflict()]);

    keepSide(0, 'b');

    expect(isResolved(0)).toBe(true);
    expect(resolutions[0]!.chosenSide).toBe('b');
    expect(resolutions[0]!.tags).toEqual({
      highway: 'footway',
      surface: 'concrete'
    });
  });

  it('keeps tags the other side added when one side is kept', () => {
    // "Keep A" settles the disputed keys in A's favor. It does not throw away
    // work B did on keys nobody disputed.
    const { keepSide, resolutions } = useConflictResolutions([
      conflict({
        a: osmNode(1, { lat: 10, version: 2, tags: { surface: 'asphalt' } }),
        b: osmNode(1, { lat: 20, version: 2, tags: { surface: 'concrete', lit: 'yes' } }),
        mergedTags: { surface: 'asphalt', lit: 'yes' }
      })
    ]);

    keepSide(0, 'a');

    expect(resolutions[0]!.tags).toEqual({ surface: 'asphalt', lit: 'yes' });
  });

  it('drops a disputed tag the kept side deleted', () => {
    const { keepSide, resolutions } = useConflictResolutions([
      conflict({
        a: osmNode(1, { lat: 10, version: 2, tags: { } }),
        b: osmNode(1, { lat: 20, version: 2, tags: { surface: 'concrete' } }),
        tagConflicts: ['surface'],
        mergedTags: { surface: 'concrete' }
      })
    ]);

    keepSide(0, 'a');

    expect(resolutions[0]!.tags).not.toHaveProperty('surface');
  });

  it('does not take a disputed tag off the prototype when the kept side lacks it', () => {
    // A tag key is arbitrary data. `toString` and friends must read as absent
    // rather than resolving to the inherited member.
    const { keepSide, resolutions } = useConflictResolutions([
      conflict({
        a: osmNode(1, { lat: 10, version: 2, tags: { } }),
        b: osmNode(1, { lat: 20, version: 2, tags: { toString: 'yes' } }),
        tagConflicts: ['toString'],
        mergedTags: { toString: 'yes' }
      })
    ]);

    keepSide(0, 'a');

    expect(Object.keys(resolutions[0]!.tags)).toEqual([]);
  });

  it('stays unresolved until every disputed tag has been decided', () => {
    const { chooseSide, setTag, isResolved } = useConflictResolutions([
      conflict({ tagConflicts: ['surface', 'width'] })
    ]);

    chooseSide(0, 'a');
    expect(isResolved(0)).toBe(false);

    setTag(0, 'surface', 'asphalt');
    expect(isResolved(0)).toBe(false);

    setTag(0, 'width', '2');
    expect(isResolved(0)).toBe(true);
  });

  it('stays unresolved until a geometry side is chosen', () => {
    const { setTag, isResolved, chooseSide } = useConflictResolutions([conflict()]);

    setTag(0, 'surface', 'asphalt');
    expect(isResolved(0)).toBe(false);

    chooseSide(0, 'b');
    expect(isResolved(0)).toBe(true);
  });

  it('treats an empty value as dropping the tag, and counts it as decided', () => {
    const { setTag, chooseSide, resolutions, isResolved } = useConflictResolutions([
      conflict()
    ]);

    chooseSide(0, 'a');
    setTag(0, 'surface', '');

    expect(resolutions[0]!.tags).not.toHaveProperty('surface');
    expect(isResolved(0)).toBe(true);
  });

  it('resolves a delete-versus-edit conflict by dropping the element', () => {
    const { dropElement, isResolved, resolutions } = useConflictResolutions([
      conflict({ kind: 'deleted-in-a', tagConflicts: ['surface'] })
    ]);

    dropElement(0);

    expect(isResolved(0)).toBe(true);
    expect(resolutions[0]!.chosenSide).toBe('delete');
  });

  it('tracks progress across several conflicts', () => {
    const { keepSide, unresolvedCount } = useConflictResolutions([
      conflict({ number: 1 }),
      conflict({ number: 2 })
    ]);

    expect(unresolvedCount.value).toBe(2);

    keepSide(0, 'a');
    expect(unresolvedCount.value).toBe(1);

    keepSide(1, 'b');
    expect(unresolvedCount.value).toBe(0);
  });

  it('reports which tags the user has decided', () => {
    const { setTag, resolutions } = useConflictResolutions([conflict()]);

    expect(resolutions[0]!.decidedTags).toEqual([]);
    setTag(0, 'surface', 'asphalt');
    expect(resolutions[0]!.decidedTags).toEqual(['surface']);
  });
});

describe('conflicts that need a decision before they count as resolved', () => {
  // A delete-versus-edit conflict has no geometry dispute: the deleted side is
  // a copy of the ancestor, so `geometryConflict` is false and `chosenSide` is
  // seeded rather than left null. That seed must not be mistaken for a
  // decision. Whether a deletion stands is the one call the user has to make,
  // and committing it silently would revert the other side's delete.
  it('starts a delete-versus-edit conflict unresolved, with no tags in dispute', () => {
    const { unresolvedCount, isResolved } = useConflictResolutions([
      conflict({ kind: 'deleted-in-a', geometryConflict: false, tagConflicts: [] })
    ]);

    expect(isResolved(0)).toBe(false);
    expect(unresolvedCount.value).toBe(1);
  });

  it('resolves it once the user keeps a side', () => {
    const { unresolvedCount, keepSide } = useConflictResolutions([
      conflict({ kind: 'deleted-in-a', geometryConflict: false, tagConflicts: [] })
    ]);

    keepSide(0, 'b');

    expect(unresolvedCount.value).toBe(0);
  });

  it('resolves it once the user honors the deletion', () => {
    const { unresolvedCount, dropElement } = useConflictResolutions([
      conflict({ kind: 'deleted-in-a', geometryConflict: false, tagConflicts: [] })
    ]);

    dropElement(0);

    expect(unresolvedCount.value).toBe(0);
  });
});
