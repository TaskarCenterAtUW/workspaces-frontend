import { geometryEqual, newerOsmElement } from '~/util/osm';

import type {
  OsmElement,
  OsmNode,
  OsmRelation,
  OsmTags,
  OsmWay
} from '~/types/osm';

export interface TagMergeResult {
  tags: OsmTags;
  conflicts: string[];
}

function ownTags(tags: OsmTags | undefined): OsmTags {
  const own: OsmTags = Object.create(null);

  // This module is deliberately free of Vue and cannot unwrap a reactive
  // proxy: copying one here reads each key through the proxy's get trap, so a
  // key named `hasOwnProperty` comes back as Vue's own function. Callers that
  // hold tags in the reactive graph unwrap with `toRaw` at their own boundary:
  //
  return Object.assign(own, tags);
}

export function mergeTagsThreeWay(
  a: OsmTags | undefined,
  b: OsmTags | undefined,
  base?: OsmElement
): TagMergeResult {
  const aTags = ownTags(a);
  const bTags = ownTags(b);

  const baseTags = ownTags(base?.tags);
  const tags: OsmTags = Object.create(null);
  const conflicts: string[] = [];

  const keys = new Set([
    ...Object.keys(aTags),
    ...Object.keys(bTags),
    ...Object.keys(baseTags)
  ]);

  for (const key of keys) {
    const aValue = aTags[key];
    const bValue = bTags[key];
    const baseValue = baseTags[key];

    if (aValue === bValue) {
      if (aValue !== undefined) {
        tags[key] = aValue;
      }
      continue;
    }

    if (base !== undefined) {
      if (aValue === baseValue) {
        if (bValue !== undefined) {
          tags[key] = bValue;
        }
        continue;
      }

      if (bValue === baseValue) {
        if (aValue !== undefined) {
          tags[key] = aValue;
        }
        continue;
      }
    }

    conflicts.push(key);

    if (aValue !== undefined) {
      tags[key] = aValue;
    }
  }

  return { tags, conflicts };
}

export function checkGeometryConflict(
  a: OsmElement,
  b: OsmElement,
  base?: OsmElement
): boolean {
  if (a.type !== b.type) {
    return true;
  }

  if (geometryEqual(a, b)) {
    return false;
  }

  if (base !== undefined && (geometryEqual(a, base) || geometryEqual(b, base))) {
    return false;
  }

  return true;
}

export function checkConflict(
  a: OsmElement,
  b: OsmElement,
  base?: OsmElement
): boolean {
  if (checkGeometryConflict(a, b, base)) {
    return true;
  }

  return mergeTagsThreeWay(a.tags, b.tags, base).conflicts.length > 0;
}

function geometrySource<T extends OsmElement>(a: T, b: T, base?: OsmElement): T {
  if (base !== undefined && geometryEqual(a, base)) {
    return b; // A did not change, so take geometry from B
  }

  return a;
}

export function mergeNodes(a: OsmNode, b: OsmNode, base?: OsmElement): OsmNode {
  const newer = newerOsmElement(a, b);
  const geometry = geometrySource(a, b, base);

  return {
    id: newer.id,
    type: 'node',
    lat: geometry.lat,
    lon: geometry.lon,
    version: newer.version + 1,
    timestamp: new Date(),
    changeset: 0,
    user: newer.user,
    uid: newer.uid,
    tags: mergeTagsThreeWay(a.tags, b.tags, base).tags
  };
}

export function mergeWays(a: OsmWay, b: OsmWay, base?: OsmElement): OsmWay {
  const newer = newerOsmElement(a, b);
  const geometry = geometrySource(a, b, base);

  return {
    id: newer.id,
    type: 'way',
    version: newer.version + 1,
    timestamp: new Date(),
    changeset: 0,
    user: newer.user,
    uid: newer.uid,
    nodes: [...geometry.nodes],
    tags: mergeTagsThreeWay(a.tags, b.tags, base).tags
  };
}

export function mergeRelations(
  a: OsmRelation,
  b: OsmRelation,
  base?: OsmElement
): OsmRelation {
  const newer = newerOsmElement(a, b);
  const geometry = geometrySource(a, b, base);

  return {
    id: newer.id,
    type: 'relation',
    version: newer.version + 1,
    timestamp: new Date(),
    changeset: 0,
    user: newer.user,
    uid: newer.uid,
    members: geometry.members.map(member => ({ ...member })),
    tags: mergeTagsThreeWay(a.tags, b.tags, base).tags
  };
}

export function mergeOsmElements(
  a: OsmElement,
  b: OsmElement,
  base?: OsmElement
): OsmElement {
  if (a.type !== b.type) {
    throw new Error(`OSM element type mismatch: ${a.type} != ${b.type}`);
  }

  if (a.type === 'node') {
    return mergeNodes(a, b as OsmNode, base);
  }

  if (a.type === 'way') {
    return mergeWays(a, b as OsmWay, base);
  }

  return mergeRelations(a, b as OsmRelation, base);
}
