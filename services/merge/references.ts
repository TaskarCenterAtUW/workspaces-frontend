import { copyOsmElement, OsmElementLookup } from '~/util/osm';

import type { MergeResult } from '~/services/merge/types';
import type { OsmElement, OsmElementType } from '~/types/osm';

export function referenceKey(type: OsmElementType, id: number): string {
  return `${type}/${id}`;
}

/**
 * Puts back elements a set still references.
 *
 * A side that deletes a way normally deletes its vertices too. When the other
 * side edited that way, the vertices are dropped as an uncontested deletion
 * while the way itself becomes a conflict, so keeping the way leaves it
 * pointing at nothing. The last agreed version of those vertices is the
 * ancestor's, which is what a kept way was drawn over.
 *
 * `excluded` names elements the user resolved as deleted. Those stay out, and
 * the reference that still needs them is left for `findDanglingReferences` to
 * report rather than silently reversing the decision.
 *
 * Restored elements can themselves reference more, so this repeats until
 * nothing further is found. Used for both a resolved set and, through
 * `repairReferences`, a merge that produced no conflicts at all.
 */
export function restoreMissingReferences(
  output: OsmElementLookup,
  ancestor: OsmElementLookup,
  excluded: ReadonlySet<string> = new Set()
) {
  for (;;) {
    let restored = false;

    for (const element of [...output]) {
      for (const [type, id] of referencesOf(element)) {
        if (output.has(type, id) || excluded.has(referenceKey(type, id))) {
          continue;
        }

        const original = ancestor.get(type, id);

        if (original) {
          output.insert(copyOsmElement(original));
          restored = true;
        }
      }
    }

    if (!restored) {
      return;
    }
  }
}

function referencesOf(element: OsmElement): [OsmElementType, number][] {
  if (element.type === 'way') {
    return element.nodes.map(ref => ['node', ref]);
  }

  if (element.type === 'relation') {
    return element.members.map(member => [member.type, member.ref]);
  }

  return [];
}

/**
 * Reports ways and relations left referencing elements the merge does not
 * contain.
 *
 * A resolution can reintroduce an element whose references the other side
 * deleted. The osmChange builder refuses those, but only once the destination
 * workspace already exists, so the failure arrives late and reads as an
 * internal error. Checking first lets the caller name what to change.
 */
export function findDanglingReferences(elements: OsmElementLookup): string[] {
  const problems: string[] = [];

  for (const element of elements) {
    for (const [type, id] of referencesOf(element)) {
      if (!elements.has(type, id)) {
        problems.push(`${element.type} ${element.id} references ${type} ${id}`);
      }
    }
  }

  return problems;
}

/** Copies the merged set and puts back anything it still references. */
export function repairReferences(result: MergeResult): OsmElementLookup {
  const repaired = new OsmElementLookup();

  for (const element of result.elements) {
    repaired.insert(copyOsmElement(element));
  }

  restoreMissingReferences(repaired, result.ancestor);

  return repaired;
}
