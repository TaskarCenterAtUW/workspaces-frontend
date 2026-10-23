import { geometryEqual } from '~/util/osm';

import type { OsmElementLookup } from '~/util/osm';
import type { OsmTags } from '~/types/osm';

/**
 * The OSM API caps a tag key, a tag value and a relation member role at 255
 * characters each, and rejects the whole upload with a 400 when any is longer.
 * Counted in code points, because the server counts characters: a surrogate
 * pair is one character to it and two units to `String.length`.
 */
export const MAX_TAG_LENGTH = 255;

/**
 * Characters XML 1.0 cannot represent, even escaped. The serializer writes them
 * through verbatim, producing a document the server cannot parse.
 *
 * Lone surrogates are here for a different reason: they serialize, but fetch's
 * UTF-8 encoder rewrites one to U+FFFD, so the tag would upload quietly
 * corrupted instead of failing. `\p{Surrogate}` under the `u` flag matches only
 * unpaired ones, so an ordinary astral character such as an emoji, which is a
 * valid surrogate pair, is left alone.
 */
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|\p{Surrogate}/u;

function describe(element: { type: string; id: number }): string {
  return `${element.type} ${element.id}`;
}

/**
 * Reports tags and relation member roles the OSM API will not accept, so a
 * merge fails while it is still only a set of resolutions rather than after the
 * destination workspace has been created and has to be rolled back. The
 * osmChange builder cannot catch these: an over-long or control-character value
 * serializes without complaint, and the server's rejection names neither the
 * element nor the tag.
 */
export function findUnusableTags(elements: OsmElementLookup): string[] {
  const problems: string[] = [];

  for (const element of elements) {
    const label = describe(element);

    for (const [key, value] of Object.entries(element.tags ?? { })) {
      if (value === undefined) {
        continue;
      }

      if ([...key].length > MAX_TAG_LENGTH) {
        problems.push(`${label}: the tag name "${key.slice(0, 40)}..." is too long`);
      }

      if ([...value].length > MAX_TAG_LENGTH) {
        problems.push(
          `${label}: the value of "${key}" is longer than ${MAX_TAG_LENGTH} characters`
        );
      }

      if (INVALID_XML.test(key) || INVALID_XML.test(value)) {
        problems.push(`${label}: the tag "${key}" contains a character XML cannot carry`);
      }
    }

    // A member role is arbitrary data that reaches the serializer the same way
    // a tag value does, and the API caps it the same way:
    //
    if (element.type === 'relation') {
      for (const member of element.members) {
        if ([...member.role].length > MAX_TAG_LENGTH) {
          problems.push(
            `${label}: the role of ${member.type} ${member.ref} is longer `
            + `than ${MAX_TAG_LENGTH} characters`
          );
        }

        if (INVALID_XML.test(member.role)) {
          problems.push(
            `${label}: the role of ${member.type} ${member.ref} contains a `
            + 'character XML cannot carry'
          );
        }
      }
    }
  }

  return problems;
}

/**
 * Checks that both workspaces were imported from the same dataset the same
 * way, and describes the first disagreement found.
 *
 * Each workspace is a separate database with its own id sequences, so element
 * 42 in one is unrelated to element 42 in the other unless the two imports
 * assigned identical ids. The merge reads its common ancestor from workspace A
 * alone and matches workspace B against it by id, so if the two imports
 * disagree, every B element still reads as untouched and A's copy silently
 * wins, losing B's work with no error at all.
 *
 * Geometry and tags are compared, but not metadata: two runs of the same
 * import assign their own changeset ids, user ids and timestamps, while a
 * given element is in the same place and carries the same tags in both unless
 * the ids have shifted or the importer itself changed.
 */
export function findImportMismatch(
  ancestorA: OsmElementLookup,
  ancestorB: OsmElementLookup
): string | undefined {
  if (ancestorA.size !== ancestorB.size) {
    return `their imports created ${ancestorA.size} and ${ancestorB.size} elements`;
  }

  for (const element of ancestorA) {
    const counterpart = ancestorB.get(element.type, element.id);

    if (!counterpart) {
      return `${describe(element)} exists in one import and not the other`;
    }

    if (!geometryEqual(element, counterpart)) {
      return `${describe(element)} is in a different place in each import`;
    }

    if (!tagsEqual(element.tags, counterpart.tags)) {
      return `${describe(element)} carries different tags in each import`;
    }
  }

  return undefined;
}

function tagsEqual(a: OsmTags | undefined, b: OsmTags | undefined): boolean {
  const left = a ?? { };
  const right = b ?? { };
  const keys = Object.keys(left);

  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && right[key] === left[key]);
}
