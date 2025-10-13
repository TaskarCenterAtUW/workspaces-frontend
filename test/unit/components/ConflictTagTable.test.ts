import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { markRaw, reactive } from 'vue';

import ConflictTagTable from '~/components/merge/ConflictTagTable.vue';
import { MAX_TAG_LENGTH } from '~/services/merge';

import { osmNode } from '../../mocks/osm-elements';

import type { ResolutionState } from '~/composables/useConflictResolutions';
import type { MergeConflict } from '~/services/merge';
import type { OsmTags } from '~/types/osm';

// A tag key is arbitrary data and OSM reserves none, so a key that happens to
// name an Object.prototype member must still read as absent when a side does
// not carry it. Reading it off the prototype instead surfaces a function, which
// renders as source, is emitted as the chosen value, and reaches the upload.
const PROTOTYPE_KEYS = ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__'];

function conflictOver(key: string, aTags: OsmTags, bTags: OsmTags): MergeConflict {
  return {
    number: 1,
    kind: 'both-modified',
    type: 'node',
    elementId: 1,
    a: osmNode(1, { version: 2, tags: aTags }),
    b: osmNode(1, { version: 2, tags: bTags }),
    base: osmNode(1, { tags: { [key]: 'original' } }),
    geometryConflict: false,
    tagConflicts: [key],
    mergedTags: { }
  };
}

// Mirrors how the page supplies it: the resolution lives inside a reactive
// array. That matters because Vue's get trap shadows `hasOwnProperty`, so a
// plain object here would not exercise the path the page actually takes.
function resolutionFor(tags: OsmTags = { }): ResolutionState {
  const resolutions = reactive<ResolutionState[]>([
    { resolved: false, chosenSide: 'a', tags: markRaw(tags), decidedTags: [] }
  ]);

  return resolutions[0]!;
}

function mountTable(conflict: MergeConflict, resolution: ResolutionState) {
  return mount(ConflictTagTable, {
    props: { conflict, resolution },
    global: { stubs: { AppIcon: true } }
  });
}

describe('ConflictTagTable prototype-named tag keys', () => {
  it.each(PROTOTYPE_KEYS)(
    'renders a %s tag the side does not carry as absent, not as an inherited member',
    (key) => {
      // A deleted the tag; B changed it. The row is a genuine dispute.
      const wrapper = mountTable(
        conflictOver(key, { }, { [key]: 'from-b' }),
        resolutionFor()
      );

      expect(wrapper.html()).not.toContain('native code');
      expect(wrapper.html()).toContain('(none)');
    }
  );

  it.each(PROTOTYPE_KEYS)('emits a string, never a function, when %s is picked', async (key) => {
    const wrapper = mountTable(
      conflictOver(key, { }, { [key]: 'from-b' }),
      resolutionFor()
    );

    // The A cell is the side that deleted the tag, so picking it means "drop".
    await wrapper.findAll('.pick-cell')[0]!.trigger('click');

    const emitted = wrapper.emitted('set-tag');

    expect(emitted).toHaveLength(1);
    expect(emitted![0]![1]).toBe('');
  });

  it('does not mark a side chosen because both reads fell through to the prototype', () => {
    // Neither side carries `toString`, and nothing has been decided, so no cell
    // should be highlighted. A prototype read makes both comparands equal.
    const conflict = conflictOver('toString', { }, { });
    const wrapper = mountTable(conflict, resolutionFor());

    expect(wrapper.find('.table-danger').exists()).toBe(false);
    expect(wrapper.find('.table-primary').exists()).toBe(false);
  });

  it('renders a real hasOwnProperty tag value rather than Vue reactivity plumbing', () => {
    // Vue's reactive get trap returns its own `hasOwnProperty` implementation
    // for that key, shadowing a real own property, so the resolution's tag map
    // is kept out of the reactive graph.
    const wrapper = mountTable(
      conflictOver('hasOwnProperty', { hasOwnProperty: 'left' }, { hasOwnProperty: 'right' }),
      resolutionFor({ hasOwnProperty: 'chosen' })
    );

    expect(wrapper.html()).not.toContain('function hasOwnProperty');
    expect(wrapper.html()).not.toContain('track(obj');
    expect(wrapper.find('input').attributes('value')).toBe('chosen');
  });

  it('still shows a prototype-named key that is a real tag on both sides', () => {
    const wrapper = mountTable(
      conflictOver('toString', { toString: 'left' }, { toString: 'right' }),
      resolutionFor()
    );

    expect(wrapper.html()).toContain('left');
    expect(wrapper.html()).toContain('right');
    expect(wrapper.html()).not.toContain('native code');
  });
});

describe('ConflictTagTable custom value input', () => {
  it('caps a typed value at the length the merge validator enforces', () => {
    // A value the input accepts but the validator rejects fails the whole
    // upload after the destination workspace has already been created.
    const wrapper = mountTable(
      conflictOver('surface', { surface: 'left' }, { surface: 'right' }),
      resolutionFor()
    );

    expect(wrapper.find('input').attributes('maxlength')).toBe(String(MAX_TAG_LENGTH));
  });
});
