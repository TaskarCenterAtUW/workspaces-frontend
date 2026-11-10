import type { OsmRelationRef } from '~/types/osm';

export function shallowArrayEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  return a.every((v, i) => v === b[i]);
}

export function shallowMembersEqual(
  a: OsmRelationRef[],
  b: OsmRelationRef[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((m, i) =>
    m.type === b[i]?.type && m.ref === b[i]?.ref && m.role === b[i]?.role
  );
}
