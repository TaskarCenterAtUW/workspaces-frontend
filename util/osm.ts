import { OSM_ELEMENT_TYPES } from '~/types/osm';

import { shallowArrayEqual, shallowMembersEqual } from '~/util/collections';

import type {
  OsmElement,
  OsmElementType,
  OsmNode,
  OsmRelation,
  OsmWay
} from '~/types/osm';
import type { WorkspaceType } from '~/types/workspaces';

export function geometryEqual(a: OsmElement, b: OsmElement): boolean {
  if (a.type !== b.type) {
    return false;
  }

  if (a.type === 'node') {
    const other = b as OsmNode;
    return a.lat === other.lat && a.lon === other.lon;
  }

  if (a.type === 'way') {
    return shallowArrayEqual(a.nodes, (b as OsmWay).nodes);
  }

  return shallowMembersEqual(a.members, (b as OsmRelation).members);
}

export function newerOsmElement<T extends OsmElement>(a: T, b: T): T {
  return a.timestamp.getTime() > b.timestamp.getTime() ? a : b;
}

export function wayToGeoJsonCoords(
  way: OsmWay,
  lookup: OsmElementLookup
): [number, number][] | undefined {
  const coords: [number, number][] = [];

  for (const nodeId of way.nodes) {
    const node = lookup.get('node', nodeId) as OsmNode | undefined;

    if (!node) {
      return undefined;
    }

    coords.push([node.lon, node.lat]);
  }

  return coords;
}

export function editorHashFor(elements: Iterable<OsmElement>): string | undefined {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const element of elements) {
    if (element.type === 'node') {
      minLat = Math.min(minLat, element.lat);
      maxLat = Math.max(maxLat, element.lat);
      minLon = Math.min(minLon, element.lon);
      maxLon = Math.max(maxLon, element.lon);
    }
  }

  if (minLat === Infinity) {
    return undefined;
  }

  return mapHash({ zoom: 16, lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 });
}

export function mapHash(view: { zoom: number; lat: number; lon: number }): string {
  return `#map=${view.zoom}/${view.lat}/${view.lon}`;
}

export function editorRoute(workspaceId: number, datatype: WorkspaceType, hash?: string) {
  return {
    path: `/workspace/${workspaceId}/edit`,
    query: { datatype },
    ...(hash ? { hash } : { })
  };
}

export function copyOsmElement<T extends OsmElement>(element: T): T {
  const copy = { ...element, timestamp: new Date(element.timestamp) };

  if (element.tags) {
    copy.tags = { ...element.tags };
  }

  if (copy.type === 'way') {
    copy.nodes = [...copy.nodes];
  } else if (copy.type === 'relation') {
    copy.members = copy.members.map(member => ({ ...member }));
  }

  return copy;
}

type OsmElementMap = Map<number, OsmElement>;

export class OsmElementLookup implements Iterable<OsmElement> {
  readonly types: Record<OsmElementType, OsmElementMap> = {
    node: new Map(),
    way: new Map(),
    relation: new Map()
  };

  constructor(elements?: Iterable<OsmElement>) {
    if (elements) {
      for (const element of elements) {
        this.insert(element);
      }
    }
  }

  get(type: OsmElementType, id: number): OsmElement | undefined {
    return this.types[type].get(id);
  }

  has(type: OsmElementType, id: number): boolean {
    return this.types[type].has(id);
  }

  insert(element: OsmElement) {
    this.types[element.type].set(element.id, element);
  }

  remove(type: OsmElementType, id: number) {
    this.types[type].delete(id);
  }

  drop(element: OsmElement) {
    this.remove(element.type, element.id);
  }

  get size(): number {
    return this.types.node.size + this.types.way.size + this.types.relation.size;
  }

  elementsForType(type: OsmElementType): MapIterator<OsmElement> {
    return this.types[type].values();
  }

  * [Symbol.iterator](): Iterator<OsmElement> {
    for (const type of OSM_ELEMENT_TYPES) {
      yield* this.elementsForType(type);
    }
  }
}
