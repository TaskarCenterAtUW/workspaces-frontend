import type { OsmNode, OsmRelation, OsmRelationRef, OsmWay } from '~/types/osm';

// Shared OSM element factories for the merge and osmChange suites. Every field
// has a fixed default so a test only states what it is actually about.

const BASE = {
  version: 1,
  changeset: 1,
  timestamp: new Date('2026-01-01T00:00:00Z'),
  user: 'tester',
  uid: 7
};

export function osmNode(id: number, overrides: Partial<OsmNode> = { }): OsmNode {
  return { ...BASE, id, type: 'node', lat: 47.6, lon: -122.3, ...overrides };
}

export function osmWay(
  id: number,
  nodes: number[],
  overrides: Partial<OsmWay> = { }
): OsmWay {
  return { ...BASE, id, type: 'way', nodes, ...overrides };
}

export function osmRelation(
  id: number,
  members: OsmRelationRef[],
  overrides: Partial<OsmRelation> = { }
): OsmRelation {
  return { ...BASE, id, type: 'relation', members, ...overrides };
}
