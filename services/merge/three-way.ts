import { referenceKey, restoreMissingReferences } from '~/services/merge/references';
import { copyOsmElement, OsmElementLookup } from '~/util/osm';
import {
  checkConflict,
  checkGeometryConflict,
  mergeOsmElements,
  mergeTagsThreeWay
} from '~/util/osm-merge';

import type {
  ConflictResolution,
  MergeConflict,
  MergeConflictKind
} from '~/services/merge/types';
import type { OsmElement } from '~/types/osm';

/**
 * Each workspace is its own database with its own ID sequence, so two
 * workspaces routinely assign the same ID to unrelated elements created after
 * the import. Those are not a conflict, they are two different elements, and
 * keeping both means giving one of them a new ID and repointing everything in
 * that workspace that referenced it.
 */
function remapCollidingIds(
  elementsB: OsmElement[],
  lookupC: OsmElementLookup,
  createdInA: OsmElementLookup
): OsmElement[] {
  const remapped = new Map<string, number>();
  let nextSyntheticId = -1;

  for (const element of elementsB) {
    if (lookupC.has(element.type, element.id)) {
      continue; // Descended from the import, so the ID is shared by design.
    }

    if (createdInA.has(element.type, element.id)) {
      remapped.set(referenceKey(element.type, element.id), nextSyntheticId--);
    }
  }

  if (remapped.size === 0) {
    return elementsB;
  }

  for (const element of elementsB) {
    if (element.type === 'way') {
      element.nodes = element.nodes.map(
        ref => remapped.get(referenceKey('node', ref)) ?? ref
      );
    } else if (element.type === 'relation') {
      element.members = element.members.map(member => ({
        ...member,
        ref: remapped.get(referenceKey(member.type, member.ref)) ?? member.ref
      }));
    }

    const newId = remapped.get(referenceKey(element.type, element.id));

    if (newId !== undefined) {
      element.id = newId;
    }
  }

  return elementsB;
}

function describeConflict(
  number: number,
  kind: MergeConflictKind,
  a: OsmElement,
  b: OsmElement,
  base?: OsmElement
): MergeConflict {
  const { tags, conflicts } = mergeTagsThreeWay(a.tags, b.tags, base);

  return {
    number,
    kind,
    type: a.type,
    // Both sides carry the same ID: the synthesised side is a copy of the
    // ancestor, which was fetched by the other side's ID.
    elementId: a.id,
    a,
    b,
    base,
    geometryConflict: checkGeometryConflict(a, b, base),
    tagConflicts: conflicts,
    mergedTags: tags
  };
}

/**
 * Merges two workspaces that share a common ancestor.
 *
 * Elements the merge settles on its own go into `merged`. Elements it cannot
 * are reported in `conflicts` and deliberately left out of `merged`: both sides
 * carry the same ID, so storing them together would silently discard one.
 * `applyResolutions` puts the user's choice back in.
 */
export function threeWayMerge(
  elementsA: OsmElement[],
  elementsB: OsmElement[],
  lookupC: OsmElementLookup
): {
  merged: OsmElementLookup;
  conflicts: MergeConflict[];
} {
  const merged = new OsmElementLookup();
  const remainingA = new OsmElementLookup();
  const conflicts: MergeConflict[] = [];

  // Work on copies throughout. The inputs belong to the caller, and the
  // ancestor lookup is read repeatedly, so mutating either corrupts later
  // comparisons:
  //
  const copiesA = elementsA.map(copyOsmElement);
  const createdInA = new OsmElementLookup();

  for (const elementA of copiesA) {
    // Absent from the import means someone created it afterwards. There is no
    // common ancestor to merge against, so it carries straight through:
    //
    if (!lookupC.has(elementA.type, elementA.id)) {
      createdInA.insert(elementA);
      merged.insert(elementA);
      continue;
    }

    remainingA.insert(elementA);
  }

  const copiesB = remapCollidingIds(
    elementsB.map(copyOsmElement),
    lookupC,
    createdInA
  );

  let conflictNumber = 1;

  for (const elementB of copiesB) {
    const base = lookupC.get(elementB.type, elementB.id);

    if (!base) {
      merged.insert(elementB);
      continue;
    }

    const elementA = remainingA.get(elementB.type, elementB.id);

    // Untouched in B, so whatever A did to it stands, including deleting it:
    //
    if (elementB.version === 1) {
      if (elementA) {
        merged.insert(elementA);
        remainingA.drop(elementA);
      }
      continue;
    }

    if (elementA) {
      remainingA.drop(elementA);

      if (elementA.version === 1) {
        merged.insert(elementB); // Untouched in A.
        continue;
      }

      if (!checkConflict(elementA, elementB, base)) {
        merged.insert(mergeOsmElements(elementA, elementB, base));
        continue;
      }

      conflicts.push(
        describeConflict(conflictNumber++, 'both-modified', elementA, elementB, base)
      );
    } else {
      conflicts.push(
        describeConflict(
          conflictNumber++,
          'deleted-in-a',
          copyOsmElement(base),
          elementB,
          base
        )
      );
    }
  }

  // Whatever is left existed in the import and is gone from B, so B deleted it.
  // An element A also left alone is simply dropped; one A modified is a
  // conflict between that edit and the deletion:
  //
  for (const elementA of remainingA) {
    if (elementA.version === 1) {
      continue;
    }

    const base = lookupC.get(elementA.type, elementA.id);

    if (base) {
      conflicts.push(
        describeConflict(
          conflictNumber++,
          'deleted-in-b',
          elementA,
          copyOsmElement(base),
          base
        )
      );
    }
  }

  return { merged, conflicts };
}

/**
 * Folds the user's conflict decisions back into the merged element set.
 *
 * Tags come from the resolution, which starts from `mergedTags`, so tags
 * neither side disputed are preserved even when the user only picks a
 * geometry. Given an `ancestor`, elements a kept way or relation still
 * references are restored from it, except those the user resolved as deleted,
 * which stay out so the contradiction is reported rather than reversed.
 */
export function applyResolutions(
  elements: OsmElementLookup,
  conflicts: MergeConflict[],
  resolutions: ConflictResolution[],
  ancestor?: OsmElementLookup
): OsmElementLookup {
  const output = new OsmElementLookup();
  const deleted = new Set<string>();

  for (const element of elements) {
    output.insert(copyOsmElement(element));
  }

  conflicts.forEach((conflict, index) => {
    const resolution = resolutions[index];

    if (!resolution?.resolved || resolution.chosenSide === null) {
      throw new Error(`Conflict ${conflict.number} has not been resolved.`);
    }

    if (resolution.chosenSide === 'delete') {
      output.remove(conflict.type, conflict.elementId);
      deleted.add(referenceKey(conflict.type, conflict.elementId));
      return;
    }

    const chosenElement = resolution.chosenSide === 'b' ? conflict.b : conflict.a;

    // Only a geometry conflict makes the two sides' shapes a choice. Without
    // one, the merge can settle the geometry itself, and taking the chosen
    // side wholesale would throw away an edit the other side made alone:
    //
    const element = copyOsmElement(
      conflict.geometryConflict
        ? chosenElement
        : mergeOsmElements(conflict.a, conflict.b, conflict.base)
    );

    element.id = conflict.elementId;
    element.tags = { ...resolution.tags };

    output.insert(element);
  });

  if (ancestor) {
    restoreMissingReferences(output, ancestor, deleted);
  }

  return output;
}
