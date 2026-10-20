/**
 * Turns a union of workspace data (DS1) and a TDEI dataset (DS2) into
 * suggestions the user accepts or rejects one at a time in Rapid.
 *
 * - An edge suggestion adds one DS2 edge piece the union kept. Its ends reuse
 *   workspace nodes where the union snapped them, or add new nodes, inserted
 *   into and splitting workspace ways where the union split them there.
 * - A tag suggestion adds the tags a DS2 node would give the workspace node it
 *   snapped onto.
 *
 * Union metadata (`ext:union_*` audit and confidence tags) is shown with a
 * suggestion but never written to the workspace. Changes the union makes to
 * DS1 alone (e.g. splitting a workspace road where a workspace crossing
 * crosses it) have no TDEI feature behind them, so they aren't suggested.
 */
import type { LonLat } from '~/services/conflation/geometry';
import { interpolate } from '~/services/conflation/geometry';
import type { Props, UnionResult } from '~/services/conflation/union';

/** Lon/lat bounds of a tile: [west, south, east, north]. */
export type Bounds = [number, number, number, number];

/** One end of a suggested edge. */
export type SuggestedEnd
  = | {
    kind: 'existing';
    /** A workspace node id. */
    nodeId: string;
    loc: LonLat;
    /** Workspace ways to split at this node. */
    splitWays: string[];
  }
  | {
    kind: 'new';
    /** The union's id for the node (a TDEI node or an intersection). */
    unionId: string;
    loc: LonLat;
    tags: Record<string, string>;
    /** Workspace ways to insert this node into and split at it. */
    insertInto: string[];
  };

export interface EdgeSuggestion {
  kind: 'edge';
  /** Stable while the data it comes from is unchanged. */
  id: string;
  /** The TDEI edge it comes from. */
  sourceEdgeId: string;
  u: SuggestedEnd;
  v: SuggestedEnd;
  /** Coordinates between the ends. */
  interior: LonLat[];
  tags: Record<string, string>;
}

export interface TagSuggestion {
  kind: 'tags';
  id: string;
  /** The workspace node that gains the tags. */
  nodeId: string;
  loc: LonLat;
  /** Tags to add; none are already on the node. */
  addTags: Record<string, string>;
  /** Union audit and confidence tags, shown but not written. */
  unionTags: Record<string, string>;
}

export type Suggestion = EdgeSuggestion | TagSuggestion;

/** Tags the union adds only to describe itself. */
export const isUnionMetadata = (key: string) => key.startsWith('ext:union_');

/** OSM tags from OSW properties: strings, without OSW's ids. */
export function toTags(props: Props): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === '_id' || k === '_u_id' || k === '_v_id' || k === '_w_id' || v === null || v === undefined) continue;
    tags[k] = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return tags;
}

const inBounds = (p: LonLat, [w, s, e, n]: Bounds) => p[0] >= w && p[0] < e && p[1] >= s && p[1] < n;

/**
 * The suggestions a tile owns: edge pieces whose midpoint is in the tile, and
 * tag changes to workspace nodes in the tile.
 * @param ds1Tags - each workspace node's tags before the union
 * @param idPrefix - makes suggestion ids unique to the dataset
 */
export function tileSuggestions(
  result: UnionResult,
  tile: Bounds,
  ds1Tags: Map<string, Record<string, string>>,
  idPrefix: string
): Suggestion[] {
  // Where the union splits workspace ways: each interior end of a DS1 piece.
  const splitsAt = new Map<string, Set<string>>();
  for (const edge of result.edges) {
    if (edge.source !== 'ds1') continue;
    const ends: [string, number][] = [[edge.u, edge.fractions[0]], [edge.v, edge.fractions[1]]];
    for (const [nodeId, fraction] of ends) {
      if (fraction <= 0 || fraction >= 1) continue;
      const ways = splitsAt.get(nodeId) ?? new Set<string>();
      ways.add(edge.sourceEdgeId);
      splitsAt.set(nodeId, ways);
    }
  }

  const nodes = new Map(result.nodes.map(n => [n.id, n]));
  const endOf = (id: string): SuggestedEnd => {
    const node = nodes.get(id)!;
    const ways = [...(splitsAt.get(id) ?? [])].sort();
    if (node.source === 'ds1') return { kind: 'existing', nodeId: id, loc: node.loc, splitWays: ways };
    // Intersection nodes carry only union metadata (ext:osw_*, ext:road_*), which isn't written.
    const tags = node.source === 'ixn' ? {} : toTags(node.props);
    return { kind: 'new', unionId: id, loc: node.loc, tags, insertInto: ways };
  };

  const out: Suggestion[] = [];
  for (const edge of result.edges) {
    if (edge.source !== 'ds2') continue;
    if (!inBounds(interpolate(edge.coords, 0.5), tile)) continue;
    out.push({
      kind: 'edge',
      id: `w-${idPrefix}-${edge.id}`,
      sourceEdgeId: edge.sourceEdgeId,
      u: endOf(edge.u),
      v: endOf(edge.v),
      interior: edge.coords.slice(1, -1),
      tags: toTags(edge.props)
    });
  }

  for (const node of result.nodes) {
    if (node.source !== 'ds1' || !node.snappedFrom.length || !inBounds(node.loc, tile)) continue;
    const before = ds1Tags.get(node.id) ?? {};
    const addTags: Record<string, string> = {};
    const unionTags: Record<string, string> = {};
    for (const [k, v] of Object.entries(toTags(node.props))) {
      if (isUnionMetadata(k)) unionTags[k] = v;
      else if (!(k in before)) addTags[k] = v;
    }
    if (!Object.keys(addTags).length) continue;
    out.push({ kind: 'tags', id: `n-${idPrefix}-${node.id}`, nodeId: node.id, loc: node.loc, addTags, unionTags });
  }
  return out;
}
