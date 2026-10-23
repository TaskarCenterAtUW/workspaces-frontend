import { markRaw, toRaw } from 'vue';

import type {
  ConflictChoice,
  ConflictResolution,
  MergeConflict
} from '~/services/merge';
import type { OsmTags } from '~/types/osm';

/*
 * Tag maps are kept raw. Tag keys are arbitrary data, and Vue's reactive proxy
 * special-cases `hasOwnProperty`, so a tag named that would read back as Vue's
 * own function rather than its value. Every assignment replaces the whole map,
 * so the UI still updates from the resolution object around it.
 */

function tagsForSide(conflict: MergeConflict, side: 'a' | 'b'): OsmTags {
  const disputed = new Set(conflict.tagConflicts);
  const sideTags = toRaw((side === 'a' ? conflict.a.tags : conflict.b.tags) ?? { });

  // Null prototype: assigning a key named `__proto__` to a plain object
  // literal runs the inherited setter and stores nothing, so the tag would
  // vanish from the upload.
  //
  const tags: OsmTags = Object.create(null);

  // Keys the two sides agreed on, plus those the three-way merge settled
  // where only one side made a change:
  //
  for (const [key, value] of Object.entries(conflict.mergedTags)) {
    if (!disputed.has(key)) {
      tags[key] = value;
    }
  }

  // A disputed key the chosen side does not have is a tag that side deleted,
  // so it stays out:
  //
  for (const key of disputed) {
    // Own properties only: `toString` and friends would otherwise resolve to
    // the inherited member.
    //
    const value = Object.hasOwn(sideTags, key) ? sideTags[key] : undefined;

    if (value !== undefined) {
      tags[key] = value;
    }
  }

  return markRaw(tags);
}

export interface ResolutionState extends ConflictResolution {
  /** Conflicting tag keys the user has settled, so progress can be tracked. */
  decidedTags: string[];
}

/**
 * Tracks how the user is resolving each merge conflict.
 *
 * Each resolution starts from the conflict's three-way merged tags, so values
 * neither side disputed survive even when the user only picks a geometry. Only
 * the keys in `tagConflicts` need a decision.
 */
export function useConflictResolutions(conflicts: MergeConflict[]) {
  const resolutions = reactive<ResolutionState[]>(
    conflicts.map(conflict => ({
      resolved: false,
      // Only a geometry conflict makes the shape a choice. Otherwise
      // `applyResolutions` settles it from the ancestor and this picks nothing
      // but the tag baseline:
      //
      chosenSide: conflict.geometryConflict ? null : 'a',
      tags: markRaw(Object.assign(Object.create(null), toRaw(conflict.mergedTags))),
      decidedTags: []
    }))
  );

  function syncResolved(index: number) {
    const conflict = conflicts[index];
    const resolution = resolutions[index];

    if (!conflict || !resolution) {
      return;
    }

    if (resolution.chosenSide === 'delete') {
      resolution.resolved = true;
      return;
    }

    if (resolution.chosenSide === null) {
      resolution.resolved = false;
      return;
    }

    resolution.resolved = conflict.tagConflicts.every(
      key => resolution.decidedTags.includes(key)
    );
  }

  function chooseSide(index: number, side: ConflictChoice) {
    const resolution = resolutions[index];

    if (!resolution) {
      return;
    }

    resolution.chosenSide = side;
    syncResolved(index);
  }

  /** Resolves a whole conflict in favor of one side. */
  function keepSide(index: number, side: 'a' | 'b') {
    const conflict = conflicts[index];
    const resolution = resolutions[index];

    if (!conflict || !resolution) {
      return;
    }

    resolution.chosenSide = side;
    resolution.tags = tagsForSide(conflict, side);
    resolution.decidedTags = [...conflict.tagConflicts];
    syncResolved(index);
  }

  /** Honors a deletion made by one side. */
  function dropElement(index: number) {
    chooseSide(index, 'delete');
  }

  function setTag(index: number, key: string, value: string) {
    const resolution = resolutions[index];

    if (!resolution) {
      return;
    }

    // An empty value is how the user drops a tag. Rest destructuring omits the
    // key without a dynamic `delete`, which eslint bans, and copying the rest
    // onto a null prototype keeps a key named `__proto__` assignable:
    //
    const { [key]: _dropped, ...rest }: OsmTags = toRaw(resolution.tags);
    const tags: OsmTags = Object.assign(Object.create(null), rest);

    if (value !== '') {
      tags[key] = value;
    }

    resolution.tags = markRaw(tags);

    if (!resolution.decidedTags.includes(key)) {
      resolution.decidedTags.push(key);
    }

    syncResolved(index);
  }

  function isResolved(index: number): boolean {
    return resolutions[index]?.resolved ?? false;
  }

  const unresolvedCount = computed(
    () => resolutions.filter(resolution => !resolution.resolved).length
  );

  return {
    resolutions,
    unresolvedCount,
    chooseSide,
    keepSide,
    dropElement,
    setTag,
    isResolved
  };
}
