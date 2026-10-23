import { describe, expect, it } from 'vitest';

import { osmNode } from '../../mocks/osm-elements';

import { mergeTagsThreeWay } from '~/util/osm-merge';

import type { OsmTags } from '~/types/osm';

/** The ancestor is an element, so that an untagged one still counts as one. */
function ancestor(tags: OsmTags) {
  return osmNode(1, { tags });
}

describe('mergeTagsThreeWay', () => {
  it('keeps a value both sides left alone', () => {
    const base = { highway: 'footway' };
    const result = mergeTagsThreeWay({ ...base }, { ...base }, ancestor(base));

    expect(result.tags).toEqual({ highway: 'footway' });
    expect(result.conflicts).toEqual([]);
  });

  it('takes the edit when only one side changed a value', () => {
    const base = { surface: 'asphalt' };

    expect(mergeTagsThreeWay({ surface: 'concrete' }, { ...base }, ancestor(base)))
      .toEqual({ tags: { surface: 'concrete' }, conflicts: [] });

    expect(mergeTagsThreeWay({ ...base }, { surface: 'gravel' }, ancestor(base)))
      .toEqual({ tags: { surface: 'gravel' }, conflicts: [] });
  });

  it('keeps a tag only one side added, without calling it a conflict', () => {
    // Two surveyors recording different attributes of the same feature is the
    // ordinary case, not a disagreement.
    const result = mergeTagsThreeWay(
      { highway: 'footway', surface: 'asphalt' },
      { highway: 'footway', lit: 'yes' },
      ancestor({ highway: 'footway' })
    );

    expect(result.tags).toEqual({
      highway: 'footway',
      surface: 'asphalt',
      lit: 'yes'
    });
    expect(result.conflicts).toEqual([]);
  });

  it('honors a deletion made by one side', () => {
    const result = mergeTagsThreeWay(
      { highway: 'footway' },
      { highway: 'footway', surface: 'asphalt' },
      ancestor({ highway: 'footway', surface: 'asphalt' })
    );

    expect(result.tags).toEqual({ highway: 'footway' });
    expect(result.conflicts).toEqual([]);
  });

  it('reports a key both sides changed to different values', () => {
    const result = mergeTagsThreeWay(
      { surface: 'asphalt' },
      { surface: 'concrete' },
      ancestor({ surface: 'gravel' })
    );

    expect(result.conflicts).toEqual(['surface']);
  });

  it('reports a delete-versus-edit on the same key', () => {
    const result = mergeTagsThreeWay(
      { },
      { surface: 'concrete' },
      ancestor({ surface: 'asphalt' })
    );

    expect(result.conflicts).toEqual(['surface']);
  });

  it('never concatenates two values into one tag', () => {
    // A value like "asphalt;concrete" is not valid data, and it silently
    // invents a third answer neither side gave.
    const result = mergeTagsThreeWay(
      { surface: 'asphalt' },
      { surface: 'concrete' },
      ancestor({ surface: 'gravel' })
    );

    expect(result.tags.surface).not.toContain(';');
    expect(result.tags.surface).toBe('asphalt');
  });

  it('treats an empty-string value as a real value, not as absent', () => {
    const result = mergeTagsThreeWay({ note: '' }, { note: 'x' }, ancestor({ note: '' }));

    expect(result.conflicts).toEqual([]);
    expect(result.tags).toEqual({ note: 'x' });
  });

  it('treats an untagged ancestor element as a common ancestor', () => {
    // The API omits `tags` entirely for an untagged element, which is every
    // vertex node in an import. Reading that absence as "no ancestor" would
    // turn every one-sided tag edit into a conflict.
    expect(mergeTagsThreeWay({ surface: 'asphalt' }, { }, osmNode(1)))
      .toEqual({ tags: { surface: 'asphalt' }, conflicts: [] });
  });

  it('treats every difference as a conflict when there is no common ancestor', () => {
    const result = mergeTagsThreeWay({ surface: 'asphalt' }, { lit: 'yes' });

    expect(result.conflicts.sort()).toEqual(['lit', 'surface']);
  });
});

describe('tag keys that collide with Object.prototype', () => {
  it.each(['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'treats a deleted %s tag as deleted, not as the inherited member',
    (key) => {
      // Reading these off a plain object literal returns the prototype member
      // rather than undefined, which makes a deletion read as "unchanged" and
      // writes a function into the merged tags, and into the uploaded XML.
      const result = mergeTagsThreeWay(
        { highway: 'footway' },
        { [key]: 'x', highway: 'footway' },
        ancestor({ [key]: 'x', highway: 'footway' })
      );

      expect(result.tags).toEqual({ highway: 'footway' });
      expect(typeof result.tags[key]).not.toBe('function');
    }
  );

  it('keeps such a key when it is a real tag both sides carry', () => {
    const result = mergeTagsThreeWay(
      { toString: 'a value' },
      { toString: 'a value' },
      ancestor({ toString: 'a value' })
    );

    expect(result.tags.toString).toBe('a value');
  });
});
