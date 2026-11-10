import { OsmChangeBuilder } from '~/util/osmChange';

import type { OsmElement, OsmRelation, OsmWay } from '~/types/osm';

export function buildOsc(changesetId: number, elements: Iterable<OsmElement>): string {
  const oscBuilder = new OsmChangeBuilder(changesetId);

  // The target workspace is empty, so every element is created. They have to
  // be emitted in dependency order for the builder to resolve `nd` and
  // `member` references to the placeholder IDs it assigns:
  //
  const ways: OsmWay[] = [];
  const relations: OsmRelation[] = [];

  for (const element of elements) {
    if (element.type === 'node') {
      oscBuilder.create(element);
    } else if (element.type === 'way') {
      ways.push(element);
    } else {
      relations.push(element);
    }
  }

  for (const way of ways) {
    oscBuilder.create(way);
  }

  for (const relation of sortRelationsByDependency(relations)) {
    oscBuilder.create(relation);
  }

  return oscBuilder.serializeXml();
}

/**
 * Orders relations so that one referencing another is emitted after it. The API
 * rejects a forward reference to a placeholder it has not seen yet.
 */
function sortRelationsByDependency(relations: OsmRelation[]): OsmRelation[] {
  const byId = new Map(relations.map(relation => [relation.id, relation]));
  const ordered: OsmRelation[] = [];
  const visited = new Set<number>();

  function visit(relation: OsmRelation, seen: Set<number>) {
    // A membership cycle cannot be ordered. Returning leaves one member
    // unresolved, which the builder reports by name, rather than looping here:
    //
    if (visited.has(relation.id) || seen.has(relation.id)) {
      return;
    }

    seen.add(relation.id);

    for (const member of relation.members) {
      if (member.type === 'relation') {
        const child = byId.get(member.ref);

        if (child) {
          visit(child, seen);
        }
      }
    }

    seen.delete(relation.id);
    visited.add(relation.id);
    ordered.push(relation);
  }

  for (const relation of relations) {
    visit(relation, new Set<number>());
  }

  return ordered;
}
