/**
 * A TypeScript port of TDEI's OSW dataset union, `content.tdei_union_dataset`
 * (TDEI-osw-datasvc-ts, migration `20261012140857-union4.3-sidewalk-crossing-route`,
 * "Version: v5"), for nodes and edges.
 *
 * DS1 is authoritative and DS2 is stitched into it: DS2 nodes snap to nearby
 * type-compatible DS1 nodes, DS2 edges are rebuilt around the snapped nodes
 * and split where DS1 nodes or road/crossing intersections fall on them, DS1
 * edges are split at T-junctions and road/crossing intersections, and DS2
 * edges that duplicate DS1 edges are dropped.
 *
 * It follows the SQL as written, including where the SQL disagrees with its
 * own comments; those places are listed in UNION_DIVERGENCES. Where the SQL
 * breaks a tie arbitrarily, this breaks it by id, so runs over overlapping
 * areas agree. All geometry is planar lon/lat degrees, as in the SQL.
 */
import {
  dist,
  equals,
  interpolate,
  lengthWithin,
  lineDistance,
  lineIntersectionPoints,
  lineLength,
  locate,
  MetricScale,
  pgFloatText,
  snapToGrid,
  substring
} from '~/services/conflation/geometry';
import type { LonLat } from '~/services/conflation/geometry';

export type Props = Record<string, unknown>;

export interface UnionNodeInput {
  /** Unique across both datasets (namespace them, e.g. `ds1:n12`). */
  id: string;
  loc: LonLat;
  props: Props;
}

export interface UnionEdgeInput {
  /** Unique across both datasets. */
  id: string;
  coords: LonLat[];
  props: Props;
}

export interface UnionDataset {
  nodes: UnionNodeInput[];
  edges: UnionEdgeInput[];
}

export interface EntityFilterBlock {
  filters?: unknown[];
  duplicate_buffer_width?: number;
  duplicate_overlap_percentage?: number;
}

export type EntityFilters = Partial<Record<'edge' | 'node' | 'zone' | 'line' | 'polygon' | 'point', EntityFilterBlock>>;

export interface UnionOptions {
  /** Snapping and split radius in metres (the SQL's default is 0.5). */
  proximity?: number;
  entityFilters?: EntityFilters | null;
  /**
   * Latitude that sets the metres-per-degree scale. The SQL averages every
   * node of both datasets; pass a fixed value so separate runs (e.g. per map
   * tile) use the same scale.
   */
  centreLat?: number;
  /** Labels confidence tags (the SQL uses `<ds1 id>+<ds2 id>`). */
  label?: string;
}

export type EdgeSource = 'ds1' | 'ds2';
export type NodeSource = 'ds1' | 'ds2' | 'ixn';

export interface UnionNode {
  id: string;
  loc: LonLat;
  props: Props;
  source: NodeSource;
  /** DS2 nodes that snapped onto this DS1 node. */
  snappedFrom: string[];
  /** For a DS2 node: whether a T-junction moved it onto a DS1 edge. */
  moved: boolean;
}

export interface UnionEdge {
  /** The SQL's `sub_edge_id`: the source edge id, plus `_<from>_<to>` fractions for a split piece. */
  id: string;
  source: EdgeSource;
  /** The input edge this came from. */
  sourceEdgeId: string;
  /** The piece's fractions of the source edge ([0, 1] when unsplit). */
  fractions: [number, number];
  coords: LonLat[];
  u: string;
  v: string;
  props: Props;
}

export type RemovalReason = 'no_endpoint' | 'same_node' | 'node_pair_duplicate' | 'covered_duplicate';

export interface RemovedEdge {
  id: string;
  sourceEdgeId: string;
  coords: LonLat[];
  reason: RemovalReason;
}

export interface NodeMapEntry {
  snapped: boolean;
  /** The DS1 node id when snapped, else the DS2 node's own id. */
  outId: string;
  outLoc: LonLat;
  /** Metres to the DS1 node, when snapped. */
  snapDist?: number;
  typeMatch?: number;
}

export interface UnionResult {
  nodes: UnionNode[];
  edges: UnionEdge[];
  /** DS2 edge pieces dropped as duplicates or for lacking endpoints. */
  removed: RemovedEdge[];
  /** Where each DS2 node went. */
  nodeMap: Map<string, NodeMapEntry>;
  /** The metres-per-degree scale used. */
  scale: MetricScale;
}

/**
 * Places where the SQL differs from its comments or the union expectations,
 * kept as the SQL has them so results match TDEI's union. To review with the
 * union's maintainers.
 */
export const UNION_DIVERGENCES = [
  'living_street is classed as "bike", not "pedestrian" as the SQL header comment says.',
  'Node type groups treat "other" as a real group for snapping; only nodes on no edge count as untyped.',
  'Pass 1 (same node pair) lets "other" match any type; Pass 2 (buffer coverage) requires the same type.',
  'The Pass 2 "along" neighbour ignores the edge filter; the coverage buffers respect it.',
  'Pass 1 also collapses DS2 edges between the same two nodes with the same type, whatever the filter.',
  'Phase 4 fallback sentinels are dead code: DS2 edges with no DS2 node near an end lose that end.',
  'DS1 edges with no DS1 node near an end are dropped.',
  'Road x crossing splits also apply between DS1\'s own roads and crossings.',
  'A road x crossing split can reuse a DS2 node id that snapped away, leaving dangling DS1 references.',
  'DS2 road x crossing split ends resolve to the nearest mapped node before the exact intersection node.',
  'Node audit keys keep the "ext:" prefix (ext:union_audit_ext:foo).'
] as const;

/** Differences between this port and the SQL, besides tie-breaks by id. */
export const PORT_DIFFERENCES = [
  'Ties the SQL breaks arbitrarily are broken by id (string order).',
  'The metres-per-degree scale comes from the given centreLat, not the average of every node.',
  'Edge ids are not renumbered 1..N; each keeps its sub_edge_id and its source.',
  'Phase 8 mixed-type ext:* normalisation is not applied.',
  'Buffer coverage measures the true round buffer, not PostGIS\'s 8-segments-per-quarter polygon.',
  'Intersection node ids hash the point\'s coordinates with a stable hash, not md5 of its WKT.',
  'String order is JavaScript code-unit order (C collation); the database\'s collation may differ.'
] as const;

const SNAP_TOLERANCE = 1e-8;
const COORD_GRID = 1e-7;
const ANGLE_COS = 0.866;
const TANGENT_PROBE = 1e-4;

type TypeGroup = 'crossing' | 'bike' | 'pedestrian' | 'road' | 'other';

const ROAD_HIGHWAYS = new Set(['primary', 'secondary', 'tertiary', 'residential', 'service', 'unclassified', 'trunk', 'motorway']);

/** A jsonb value as `->>` / `#>> '{}'` returns it: strings unquoted, null as null. */
export function jsonbText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return jsonbCanonical(value);
}

/** jsonb's canonical text: a space after ':' and ','. */
function jsonbCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonbCanonical).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${jsonbCanonical(v)}`).join(', ')}}`;
  }
  return JSON.stringify(value);
}

/** jsonb containment, `props @> group`. */
export function jsonbContains(container: unknown, contained: unknown): boolean {
  if (Array.isArray(contained)) {
    return Array.isArray(container) && contained.every(c => container.some(x => jsonbContains(x, c)));
  }
  if (contained && typeof contained === 'object') {
    if (!container || typeof container !== 'object' || Array.isArray(container)) return false;
    return Object.entries(contained).every(([k, v]) => k in container && jsonbContains((container as Props)[k], v));
  }
  return container === contained;
}

/** Whether properties match a filter list (OR of groups); no list means no filter. */
function matchesFilter(props: Props, groups: unknown[] | null): boolean {
  return !groups || groups.some(g => jsonbContains(props, g));
}

function filterGroups(filters: EntityFilters | null | undefined, type: keyof EntityFilters): unknown[] | null {
  const groups = filters?.[type]?.filters;
  return Array.isArray(groups) && groups.length ? groups : null;
}

const FILTER_TYPES = ['edge', 'node', 'zone', 'line', 'polygon', 'point'];
const FILTER_KEYS = ['filters', 'duplicate_buffer_width', 'duplicate_overlap_percentage'];

/** Rejects unknown or misplaced entity_filters settings, as the SQL does. */
export function validateEntityFilters(filters: unknown): void {
  if (filters === null || filters === undefined) return;
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    throw new Error('entity_filters must be a JSON object keyed by file type (edge, node, zone, line, polygon, point)');
  }
  for (const [type, cfg] of Object.entries(filters)) {
    if (!FILTER_TYPES.includes(type)) throw new Error(`entity_filters: unknown file type "${type}"`);
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error(`entity_filters.${type} must be an object`);
    for (const key of Object.keys(cfg)) {
      if (!FILTER_KEYS.includes(key)) throw new Error(`entity_filters.${type}: unknown setting "${key}"`);
    }
    const block = cfg as EntityFilterBlock;
    if ('filters' in block && !Array.isArray(block.filters)) throw new Error(`entity_filters.${type}.filters must be a list of filter groups`);
    if ('duplicate_buffer_width' in block) {
      if (!['edge', 'line'].includes(type)) throw new Error(`entity_filters.${type}.duplicate_buffer_width is not supported`);
      if (typeof block.duplicate_buffer_width !== 'number' || block.duplicate_buffer_width <= 0) {
        throw new Error(`entity_filters.${type}.duplicate_buffer_width must be a number greater than 0`);
      }
    }
    if ('duplicate_overlap_percentage' in block) {
      if (['node', 'point'].includes(type)) throw new Error(`entity_filters.${type}.duplicate_overlap_percentage is not supported`);
      const pct = block.duplicate_overlap_percentage;
      if (typeof pct !== 'number' || pct <= 0 || pct > 100) {
        throw new Error(`entity_filters.${type}.duplicate_overlap_percentage must be a number above 0 and at most 100`);
      }
    }
  }
}

/** Edge type group (Phase 1b); `ext:*` keys never affect it. */
export function edgeTypeGroup(props: Props): TypeGroup {
  const highway = jsonbText(props.highway);
  const footway = jsonbText(props.footway);
  if (highway === 'footway' && (footway === 'crossing' || footway === 'traffic_island')) return 'crossing';
  if (highway === 'living_street') return 'bike';
  if (highway === 'footway' || highway === 'pedestrian' || highway === 'steps') return 'pedestrian';
  if (highway && ROAD_HIGHWAYS.has(highway)) return 'road';
  return 'other';
}

function isSidewalk(props: Props): boolean {
  return jsonbText(props.highway) === 'footway' && jsonbText(props.footway) === 'sidewalk';
}

function isKerb(props: Props): boolean {
  return jsonbText(props.barrier) === 'kerb';
}

/** String order, for ids. */
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A stable short hash of a string (FNV-1a, hex). */
function stableHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

interface Edge extends UnionEdgeInput {
  ds: 1 | 2;
  type: TypeGroup;
  sidewalk: boolean;
  filterOk: boolean;
  start: LonLat;
  end: LonLat;
  bbox: [number, number, number, number];
}

interface Node extends UnionNodeInput {
  ds: 1 | 2;
}

interface NodeGroups {
  groups: Set<TypeGroup>;
  onSidewalk: boolean;
  crossingEnd: boolean;
  filterOk: boolean;
}

interface Split {
  nodeId: string | null;
  loc: LonLat;
  fraction: number;
}

/** Finds nodes near a point quickly: a uniform grid of cells. */
class NodeIndex {
  #cells = new Map<string, Node[]>();
  constructor(private nodes: Node[], private size: number) {
    for (const node of nodes) {
      const key = this.#key(node.loc);
      const cell = this.#cells.get(key);
      if (cell) cell.push(node);
      else this.#cells.set(key, [node]);
    }
  }

  #key(p: LonLat, dx = 0, dy = 0) {
    return `${Math.floor(p[0] / this.size) + dx},${Math.floor(p[1] / this.size) + dy}`;
  }

  /** Nodes within `radius` degrees of p (radius must not exceed the cell size). */
  near(p: LonLat, radius: number): Node[] {
    const out: Node[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const node of this.#cells.get(this.#key(p, dx, dy)) ?? []) {
          if (dist(node.loc, p) <= radius) out.push(node);
        }
      }
    }
    return out;
  }

  /** Nodes exactly at p. */
  at(p: LonLat): Node[] {
    return (this.#cells.get(this.#key(p)) ?? []).filter(node => equals(node.loc, p));
  }

  /** Nodes within `radius` of any point of a line. */
  nearLine(line: LonLat[], radius: number): Node[] {
    const [minX, minY, maxX, maxY] = bboxOf(line);
    const out: Node[] = [];
    for (let x = Math.floor((minX - radius) / this.size); x <= Math.floor((maxX + radius) / this.size); x++) {
      for (let y = Math.floor((minY - radius) / this.size); y <= Math.floor((maxY + radius) / this.size); y++) {
        for (const node of this.#cells.get(`${x},${y}`) ?? []) out.push(node);
      }
    }
    return out;
  }
}

function bboxOf(coords: LonLat[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

/** Whether an edge's bounding box is within `radius` of a point. */
function bboxNear(edge: Edge, p: LonLat, radius: number): boolean {
  const [minX, minY, maxX, maxY] = edge.bbox;
  return p[0] >= minX - radius && p[0] <= maxX + radius && p[1] >= minY - radius && p[1] <= maxY + radius;
}

function bboxesNear(a: Edge, b: Edge, radius: number): boolean {
  return a.bbox[0] - radius <= b.bbox[2] && b.bbox[0] - radius <= a.bbox[2]
    && a.bbox[1] - radius <= b.bbox[3] && b.bbox[1] - radius <= a.bbox[3];
}

const withoutKeys = (props: Props, keys: string[]) => Object.fromEntries(Object.entries(props).filter(([k]) => !keys.includes(k)));

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Unions DS2 into DS1. Node and edge ids must be unique across both datasets.
 */
export function unionDatasets(ds1: UnionDataset, ds2: UnionDataset, options: UnionOptions = {}): UnionResult {
  validateEntityFilters(options.entityFilters);
  const filters = options.entityFilters ?? null;
  const proximity = Math.fround(options.proximity ?? 0.5);
  const label = options.label ?? 'ds1+ds2';

  const allNodes = [...ds1.nodes, ...ds2.nodes];
  const centreLat = options.centreLat
    ?? (allNodes.length ? allNodes.reduce((sum, n) => sum + n.loc[1], 0) / allNodes.length : 0);
  const scale = new MetricScale(centreLat);
  const proxDeg = Math.fround(scale.degrees(proximity));

  const edgeBlock = filters?.edge;
  const edgeBufferDeg = scale.degrees(edgeBlock?.duplicate_buffer_width ?? proximity);
  const edgeOverlap = (edgeBlock?.duplicate_overlap_percentage ?? 80) / 100;
  const fEdge = filterGroups(filters, 'edge');
  const fNode = filterGroups(filters, 'node');

  // ── Inputs ──────────────────────────────────────────────────────────────
  const toEdge = (e: UnionEdgeInput, ds: 1 | 2): Edge => ({
    ...e,
    ds,
    type: edgeTypeGroup(e.props),
    sidewalk: isSidewalk(e.props),
    filterOk: matchesFilter(e.props, fEdge),
    start: e.coords[0]!,
    end: e.coords[e.coords.length - 1]!,
    bbox: bboxOf(e.coords)
  });
  const edges1 = ds1.edges.filter(e => e.coords.length >= 2).map(e => toEdge(e, 1));
  const edges2 = ds2.edges.filter(e => e.coords.length >= 2).map(e => toEdge(e, 2));
  const nodes1: Node[] = ds1.nodes.map(n => ({ ...n, ds: 1 }));
  const nodes2: Node[] = ds2.nodes.map(n => ({ ...n, ds: 2 }));
  const nodeById = new Map<string, Node>([...nodes1, ...nodes2].map(n => [n.id, n]));

  const cellSize = Math.max(proxDeg, edgeBufferDeg, 1e-6) * 4;
  const index1 = new NodeIndex(nodes1, cellSize);
  const index2 = new NodeIndex(nodes2, cellSize);

  /** Edges of a dataset whose end is exactly at p, with the other end. */
  const endsAt = (edges: Edge[], p: LonLat) => {
    const out: { edge: Edge; far: LonLat }[] = [];
    for (const edge of edges) {
      if (equals(edge.start, p)) out.push({ edge, far: edge.end });
      if (equals(edge.end, p)) out.push({ edge, far: edge.start });
    }
    return out;
  };

  /** Metric distance from a point to a line, via the degree-space closest point. */
  const distMToLine = (line: LonLat[], p: LonLat) => scale.distM(locate(line, p).point, p);

  /** Within proximity of a line: degree prefilter, then the metric circle. */
  const withinProximityOfLine = (edge: Edge, p: LonLat) =>
    bboxNear(edge, p, proxDeg) && locate(edge.coords, p).distance <= proxDeg && distMToLine(edge.coords, p) <= proximity;

  const openFraction = (f: number) => f > SNAP_TOLERANCE && f < 1 - SNAP_TOLERANCE;

  // ── Phase 1b: node group sets ───────────────────────────────────────────
  const groupsOf = (node: Node, edges: Edge[]): NodeGroups => {
    const groups = new Set<TypeGroup>();
    let onSidewalk = false;
    let crossingEnd = false;
    let filterOk = !fEdge;
    for (const edge of edges) {
      if (!bboxNear(edge, node.loc, SNAP_TOLERANCE)) continue;
      if (locate(edge.coords, node.loc).distance > SNAP_TOLERANCE) continue;
      groups.add(edge.type);
      if (edge.sidewalk) onSidewalk = true;
      if (edge.type === 'crossing' && (equals(node.loc, edge.start) || equals(node.loc, edge.end))) crossingEnd = true;
      if (fEdge && edge.filterOk) filterOk = true;
    }
    return { groups, onSidewalk, crossingEnd, filterOk };
  };
  const groups1 = new Map(nodes1.map(n => [n.id, groupsOf(n, edges1)]));
  const groups2 = new Map(nodes2.map(n => [n.id, groupsOf(n, edges2)]));

  // ── Phase 2: NodeMap ────────────────────────────────────────────────────
  const nodeMap = new Map<string, NodeMapEntry & { ds2Loc: LonLat; attrMergeOk: boolean }>();
  for (const n2 of nodes2) {
    const g2 = groups2.get(n2.id)!;
    let best: { d1: Node; d: number } | undefined;
    for (const d1 of index1.near(n2.loc, proxDeg)) {
      const d = scale.distM(n2.loc, d1.loc);
      if (d > proximity) continue;
      if (!allowed(n2, d1, g2, groups1.get(d1.id)!, d)) continue;
      if (!best || d < best.d || (d === best.d && byId(d1.id, best.d1.id) < 0)) best = { d1, d };
    }
    if (best) {
      const g1 = groups1.get(best.d1.id)!;
      let typeMatch: number;
      if (!g2.groups.size || !g1.groups.size) typeMatch = 0.5;
      else if ([...g2.groups].some(g => g1.groups.has(g))) typeMatch = 1.0;
      else if ((g2.crossingEnd && g1.onSidewalk) || (g1.crossingEnd && g2.onSidewalk)) typeMatch = 1.0;
      else typeMatch = 0.5;
      const attrMergeOk = g2.filterOk && g1.filterOk && matchesFilter(n2.props, fNode) && matchesFilter(best.d1.props, fNode);
      nodeMap.set(n2.id, {
        snapped: true, outId: best.d1.id, outLoc: best.d1.loc, ds2Loc: n2.loc,
        snapDist: best.d, typeMatch, attrMergeOk
      });
    } else {
      nodeMap.set(n2.id, { snapped: false, outId: n2.id, outLoc: n2.loc, ds2Loc: n2.loc, attrMergeOk: false });
    }
  }

  function allowed(n2: Node, d1: Node, g2: NodeGroups, g1: NodeGroups, d: number): boolean {
    if (equals(n2.loc, d1.loc)) return true; // coincidence always merges
    if (isKerb(n2.props)) return false; // a DS2 kerb never moves
    if (!g2.groups.size || !g1.groups.size) return true;
    if ([...g2.groups].some(g => g1.groups.has(g))) return true;
    if (!((g2.crossingEnd && g1.onSidewalk) || (g1.crossingEnd && g2.onSidewalk))) return false;
    // Split beats snap (i): d1, a DS1 crossing end, lies on the span of a DS2 sidewalk ending at n2.
    if (g1.crossingEnd) {
      for (const { edge } of endsAt(edges2, n2.loc)) {
        if (!edge.sidewalk) continue;
        if (withinProximityOfLine(edge, d1.loc) && openFraction(locate(edge.coords, d1.loc).fraction)) return false;
      }
    }
    // Split beats snap (ii): a DS1 sidewalk span is nearer to this DS2 crossing end than d1.
    if (g2.crossingEnd) {
      for (const e1 of edges1) {
        if (!e1.sidewalk || e1.type === 'road' || !bboxNear(e1, n2.loc, proxDeg)) continue;
        const loc = locate(e1.coords, n2.loc);
        if (loc.distance > proxDeg || !openFraction(loc.fraction)) continue;
        if (scale.distM(loc.point, n2.loc) < d) return false;
      }
    }
    // Nearer end only: the far end of a DS2 crossing/sidewalk ending here is nearer to d1.
    for (const { edge, far } of endsAt(edges2, n2.loc)) {
      if ((edge.type === 'crossing' && g1.onSidewalk) || (edge.sidewalk && g1.crossingEnd)) {
        if (scale.distM(far, d1.loc) < d) return false;
      }
    }
    return true;
  }

  // ── Phase 3.1: DS1 nodes on DS2 edge interiors ──────────────────────────
  const ds2Splits = new Map<string, Split[]>(); // DS2 edge id -> interior splits
  const addSplit = (map: Map<string, Split[]>, edgeId: string, split: Split) => {
    const list = map.get(edgeId);
    if (list) list.push(split);
    else map.set(edgeId, [split]);
  };
  const snappedOnto = new Map<string, Node[]>(); // DS1 id -> DS2 nodes snapped onto it
  for (const n2 of nodes2) {
    const entry = nodeMap.get(n2.id)!;
    if (!entry.snapped) continue;
    const list = snappedOnto.get(entry.outId);
    if (list) list.push(n2);
    else snappedOnto.set(entry.outId, [n2]);
  }
  for (const e of edges2) {
    for (const n of index1.nearLine(e.coords, proxDeg)) {
      const loc = locate(e.coords, n.loc);
      if (loc.distance > proxDeg || scale.distM(loc.point, n.loc) > proximity) continue;
      const g1 = groups1.get(n.id)!;
      let typeOk = e.type === 'other' || !g1.groups.size || g1.groups.has(e.type);
      if (!typeOk && e.sidewalk && g1.crossingEnd) {
        const myDist = scale.distM(loc.point, n.loc);
        typeOk = !endsAt(edges1, n.loc).some(({ edge, far }) =>
          edge.type === 'crossing' && distMToLine(e.coords, far) < myDist);
      }
      if (!typeOk) continue;
      const suppressed = (snappedOnto.get(n.id) ?? []).some(en =>
        dist(en.loc, e.start) <= proxDeg || dist(en.loc, e.end) <= proxDeg);
      if (suppressed) continue;
      if (!openFraction(loc.fraction)) continue;
      addSplit(ds2Splits, e.id, { nodeId: n.id, loc: n.loc, fraction: loc.fraction });
    }
  }

  // ── Phase 3.2–3.3: road × crossing intersections ────────────────────────
  const allEdges = [...edges1, ...edges2];
  const roads = allEdges.filter(e => e.type === 'road').sort((a, b) => byId(a.id, b.id));
  const crossings = allEdges.filter(e => e.type === 'crossing').sort((a, b) => byId(a.id, b.id));
  interface SharedNode { nodeId: string; loc: LonLat; isNew: boolean; road: Edge; crossing: Edge; raw: LonLat }
  const sharedByPoint = new Map<string, SharedNode>();
  const pairsByPoint = new Map<string, { road: Edge; crossing: Edge }[]>();
  for (const road of roads) {
    for (const crossing of crossings) {
      if (!bboxesNear(road, crossing, 0)) continue;
      for (const p of lineIntersectionPoints(road.coords, crossing.coords)) {
        const key = `${p[0]},${p[1]}`;
        const pairs = pairsByPoint.get(key) ?? [];
        pairs.push({ road, crossing });
        pairsByPoint.set(key, pairs);
        if (sharedByPoint.has(key)) continue; // first pair by (road id, crossing id) supplies the id
        const existing = [...index1.at(p), ...index2.at(p)].sort((a, b) => a.ds - b.ds || byId(a.id, b.id))[0];
        if (existing) {
          sharedByPoint.set(key, { nodeId: existing.id, loc: existing.loc, isNew: false, road, crossing, raw: p });
        } else {
          const nodeId = `ixn-${road.id}-${crossing.id}-${stableHash(`POINT(${p[0]} ${p[1]})`)}`;
          sharedByPoint.set(key, { nodeId, loc: snapToGrid(p, COORD_GRID), isNew: true, road, crossing, raw: p });
        }
      }
    }
  }
  const ds1Splits = new Map<string, Split[]>(); // DS1 edge id -> splits
  for (const [key, pairs] of pairsByPoint) {
    const shared = sharedByPoint.get(key)!;
    for (const edge of new Set(pairs.flatMap(({ road, crossing }) => [road, crossing]))) {
      const fraction = locate(edge.coords, shared.loc).fraction;
      if (!openFraction(fraction)) continue;
      if (edge.ds === 2) addSplit(ds2Splits, edge.id, { nodeId: null, loc: shared.loc, fraction });
      else addSplit(ds1Splits, edge.id, { nodeId: shared.nodeId, loc: shared.loc, fraction });
    }
  }
  const crossingSplitNodeIds = new Set([...ds1Splits.values()].flat().map(s => s.nodeId));

  // ── Phase 3.4: T-junctions onto DS1 spans ───────────────────────────────
  interface TCandidate { edge: Edge; splitNodeId: string; loc: LonLat; ds2Loc: LonLat; distM: number; moves: boolean; ds2NodeId: string }
  const candidates: TCandidate[] = [];
  const nonRoad1 = edges1.filter(e => e.type !== 'road');
  const ds1EndPoints = new Set(edges1.flatMap(e => [`${e.start[0]},${e.start[1]}`, `${e.end[0]},${e.end[1]}`]));
  for (const n2 of nodes2) {
    const entry = nodeMap.get(n2.id)!;
    if (!entry.snapped) {
      // (a) an unsnapped DS2 node near a DS1 span
      const g2 = groups2.get(n2.id)!;
      for (const e of nonRoad1) {
        if (!withinProximityOfLine(e, n2.loc)) continue;
        const loc = locate(e.coords, n2.loc);
        const myDist = scale.distM(loc.point, n2.loc);
        let typeOk = !g2.groups.size || e.type === 'other' || g2.groups.has(e.type);
        if (!typeOk && e.sidewalk && g2.crossingEnd) {
          typeOk = !endsAt(edges2, n2.loc).some(({ edge, far }) =>
            edge.type === 'crossing' && distMToLine(e.coords, far) < myDist);
        }
        if (!typeOk) continue;
        const kerb = isKerb(n2.props);
        candidates.push({
          edge: e, splitNodeId: n2.id, ds2NodeId: n2.id, ds2Loc: n2.loc, distM: myDist,
          loc: kerb ? n2.loc : snapToGrid(loc.point, COORD_GRID), moves: !kerb
        });
      }
    } else {
      // (b) a DS2 node snapped onto a DS1 interior vertex
      const d1 = nodeById.get(entry.outId)!;
      if (ds1EndPoints.has(`${d1.loc[0]},${d1.loc[1]}`)) continue;
      for (const e of nonRoad1) {
        if (!bboxNear(e, d1.loc, SNAP_TOLERANCE) || locate(e.coords, d1.loc).distance > SNAP_TOLERANCE) continue;
        candidates.push({ edge: e, splitNodeId: d1.id, ds2NodeId: n2.id, ds2Loc: n2.loc, distM: 0, loc: d1.loc, moves: false });
      }
    }
  }
  const dirs = edges2.flatMap(e => [
    { pt: e.start, nxt: e.coords[1]!, far: e.end },
    { pt: e.end, nxt: e.coords[e.coords.length - 2]!, far: e.start }
  ]);
  const passing = candidates.flatMap((c) => {
    const fraction = locate(c.edge.coords, c.loc).fraction;
    if (!openFraction(fraction)) return [];
    if (crossingSplitNodeIds.has(c.splitNodeId)) return [];
    const pa = interpolate(c.edge.coords, Math.max(fraction - TANGENT_PROBE, 0));
    const pb = interpolate(c.edge.coords, Math.min(fraction + TANGENT_PROBE, 1));
    const t = scale.toMetres([pb[0] - pa[0], pb[1] - pa[1]]);
    const ok = dirs.some((d) => {
      if (!equals(d.pt, c.ds2Loc)) return false;
      if (!(distMToLine(c.edge.coords, d.far) > c.distM)) return false;
      const s = scale.toMetres([d.nxt[0] - d.pt[0], d.nxt[1] - d.pt[1]]);
      const norms = Math.hypot(...t) * Math.hypot(...s);
      if (norms === 0) return false;
      return Math.abs(t[0] * s[0] + t[1] * s[1]) < ANGLE_COS * norms;
    });
    return ok ? [{ ...c, fraction }] : [];
  });
  // One split per split node: the nearest DS1 edge.
  const perNode = new Map<string, (typeof passing)[number]>();
  for (const c of [...passing].sort((a, b) => a.distM - b.distM || byId(a.edge.id, b.edge.id))) {
    if (!perNode.has(c.splitNodeId)) perNode.set(c.splitNodeId, c);
  }
  // At most one node splits a DS1 edge at a given point.
  const perPoint = new Map<string, (typeof passing)[number]>();
  for (const c of [...perNode.values()].sort((a, b) => a.distM - b.distM || byId(a.splitNodeId, b.splitNodeId))) {
    const key = `${c.edge.id}|${c.loc[0]},${c.loc[1]}`;
    if (!perPoint.has(key)) perPoint.set(key, c);
  }
  for (const c of perPoint.values()) {
    addSplit(ds1Splits, c.edge.id, { nodeId: c.splitNodeId, loc: c.loc, fraction: c.fraction });
    if (c.moves) nodeMap.get(c.ds2NodeId)!.outLoc = c.loc;
  }

  // ── Phases 4–5: DS2 edge reconstruction ─────────────────────────────────
  const nearestDs2Node = (p: LonLat) => {
    let best: Node | undefined;
    let bestD = Infinity;
    for (const n of index2.near(p, proxDeg)) {
      const d = dist(n.loc, p);
      if (d < bestD || (d === bestD && best && byId(n.id, best.id) < 0)) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };
  interface SubEdge { id: string; edge: Edge; fractions: [number, number]; coords: LonLat[]; u: string | null; v: string | null }
  const subEdges: SubEdge[] = [];
  const removed: RemovedEdge[] = [];
  for (const e of edges2) {
    const rows: Split[] = [];
    for (const [p, fraction] of [[e.start, 0], [e.end, 1]] as const) {
      const n = nearestDs2Node(p);
      if (n) {
        const entry = nodeMap.get(n.id)!;
        rows.push({ nodeId: entry.outId, loc: entry.outLoc, fraction });
      }
    }
    rows.push(...(ds2Splits.get(e.id) ?? []));
    const kept = dedupeSplits(rows);
    const pieces = piecesOf(e, kept, (from, to, coords) => {
      subEdges.push({
        id: `${e.id}_${pgFloatText(from.fraction)}_${pgFloatText(to.fraction)}`,
        edge: e, fractions: [from.fraction, to.fraction], coords, u: from.nodeId, v: to.nodeId
      });
    });
    if (!pieces) removed.push({ id: e.id, sourceEdgeId: e.id, coords: e.coords, reason: 'no_endpoint' });
  }

  // ── Phase 6.1–6.3: nodes ────────────────────────────────────────────────
  const outNodes = new Map<string, UnionNode>();
  for (const x of nodes1) {
    const snaps = (snappedOnto.get(x.id) ?? []).sort((a, b) => byId(a.id, b.id));
    const props: Props = { ...withoutKeys(x.props, ['_id']) };
    const newProps: Props = {};
    const audit: Props = {};
    const keys = new Set(snaps.flatMap(n2 => Object.keys(withoutKeys(n2.props, ['_id']))));
    for (const k of [...keys].sort(byId)) {
      let value: unknown = null;
      for (const n2 of snaps) { // greatest DS2 id among eligible rows wins
        if (nodeMap.get(n2.id)!.attrMergeOk && k in n2.props && n2.props[k] !== null) value = n2.props[k];
      }
      if (value !== null && !(k in x.props)) newProps[k] = value;
      const parts = snaps.flatMap((n2) => {
        if (!(k in n2.props)) return [];
        const text = jsonbText(n2.props[k]);
        return text === null ? [] : [`${n2.id}-${text}`];
      });
      if (snaps.some(n2 => k in n2.props)) audit[`ext:union_audit_${k}`] = parts.length ? parts.join(',') : null;
    }
    let confidence: Props = {};
    if (snaps.length) {
      let best: { blend: number; prox: number; type: number } | undefined;
      for (const n2 of snaps) {
        const entry = nodeMap.get(n2.id)!;
        const prox = proximity === 0 ? 0 : Math.min(1, Math.max(0, 1 - entry.snapDist! / proximity));
        const type = entry.typeMatch ?? 0.5;
        const blend = 0.7 * prox + 0.3 * type;
        if (!best || blend > best.blend) best = { blend, prox, type };
      }
      confidence = {
        'ext:union_confidence': round3(best!.blend),
        'ext:union_confidence_source': label,
        'ext:union_confidence_status': 'merged',
        'ext:union_confidence_proximity': round3(best!.prox),
        'ext:union_confidence_type_match': round3(best!.type)
      };
    } else if ('ext:union_confidence' in x.props) {
      confidence = {
        'ext:union_confidence': x.props['ext:union_confidence'],
        'ext:union_confidence_source': x.props['ext:union_confidence_source'] ?? 'prior',
        'ext:union_confidence_status': 'carried'
      };
    }
    outNodes.set(x.id, {
      id: x.id, loc: x.loc, source: 'ds1', moved: false, snappedFrom: snaps.map(n => n.id),
      props: { ...props, ...newProps, ...audit, ...confidence }
    });
  }
  for (const n2 of nodes2) {
    const entry = nodeMap.get(n2.id)!;
    if (entry.snapped) continue;
    outNodes.set(n2.id, {
      id: n2.id, loc: entry.outLoc, source: 'ds2', snappedFrom: [], moved: !equals(entry.outLoc, n2.loc),
      props: withoutKeys(n2.props, ['_id'])
    });
  }
  const ixnNodes = [...sharedByPoint.values()].filter(s => s.isNew);
  for (const s of ixnNodes) {
    const tags: Props = {};
    for (const [k, v] of Object.entries(withoutKeys(s.crossing.props, ['_id', '_u_id', '_v_id']))) tags[`ext:osw_${k.replace(/^ext:/, '')}`] = v;
    for (const [k, v] of Object.entries(withoutKeys(s.road.props, ['_id', '_u_id', '_v_id']))) tags[`ext:road_${k.replace(/^ext:/, '')}`] = v;
    outNodes.set(s.nodeId, { id: s.nodeId, loc: s.loc, source: 'ixn', snappedFrom: [], moved: false, props: tags });
  }

  // ── Phase 6.4: DS1 output edges ─────────────────────────────────────────
  const nearestDs1Node = (p: LonLat) => {
    let best: Node | undefined;
    let bestD = Infinity;
    for (const n of index1.near(p, proxDeg)) {
      const d = dist(n.loc, p);
      if (d < bestD || (d === bestD && best && byId(n.id, best.id) < 0)) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };
  const ds1Out: UnionEdge[] = [];
  const ds1Pairs: { a: string; b: string; type: TypeGroup }[] = [];
  for (const e of edges1) {
    const u = nearestDs1Node(e.start);
    const v = nearestDs1Node(e.end);
    if (e.filterOk && u && v && u.id !== v.id) {
      ds1Pairs.push({ a: u.id < v.id ? u.id : v.id, b: u.id < v.id ? v.id : u.id, type: e.type });
    }
    const splits = ds1Splits.get(e.id);
    if (!splits) {
      if (u && v) {
        ds1Out.push({ id: e.id, source: 'ds1', sourceEdgeId: e.id, fractions: [0, 1], coords: e.coords, u: u.id, v: v.id, props: e.props });
      }
      continue;
    }
    const rows: Split[] = [];
    if (u) rows.push({ nodeId: u.id, loc: u.loc, fraction: 0 });
    if (v) rows.push({ nodeId: v.id, loc: v.loc, fraction: 1 });
    rows.push(...splits);
    piecesOf(e, dedupeSplits(rows), (from, to, coords) => {
      if (from.nodeId === null || to.nodeId === null) return;
      ds1Out.push({
        id: `${e.id}_${pgFloatText(from.fraction)}_${pgFloatText(to.fraction)}`,
        source: 'ds1', sourceEdgeId: e.id, fractions: [from.fraction, to.fraction], coords, u: from.nodeId, v: to.nodeId, props: e.props
      });
    });
  }

  // ── Phase 6.5: DS2 endpoint resolution and alignment ────────────────────
  const mapped = [...nodeMap.entries()].map(([, entry]) => entry);
  const resolve = (p: LonLat): string | null => {
    let best: (typeof mapped)[number] | undefined;
    let bestD = Infinity;
    for (const entry of mapped) {
      const d = dist(entry.outLoc, p);
      if (d > proxDeg) continue;
      if (d < bestD || (d === bestD && best && byId(entry.outId, best.outId) < 0)) {
        best = entry;
        bestD = d;
      }
    }
    if (best) return best.outId;
    return ixnNodes.find(s => equals(s.loc, p))?.nodeId ?? null;
  };
  interface Resolved extends SubEdge { uOut: string | null; vOut: string | null }
  const resolved: Resolved[] = subEdges.map((s) => {
    const uOut = s.u ?? resolve(s.coords[0]!);
    const vOut = s.v ?? resolve(s.coords[s.coords.length - 1]!);
    const coords = [...s.coords];
    const uNode = uOut ? outNodes.get(uOut) : undefined;
    const vNode = vOut ? outNodes.get(vOut) : undefined;
    if (uNode) coords[0] = uNode.loc;
    if (vNode) coords[coords.length - 1] = vNode.loc;
    return { ...s, coords, uOut, vOut };
  });

  // ── Phase 6.6: Pass 1, node-pair dedup ──────────────────────────────────
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pass1: Resolved[] = [];
  for (const r of resolved) {
    if (r.uOut === null || r.vOut === null) {
      removed.push({ id: r.id, sourceEdgeId: r.edge.id, coords: r.coords, reason: 'no_endpoint' });
      continue;
    }
    if (r.uOut === r.vOut) {
      removed.push({ id: r.id, sourceEdgeId: r.edge.id, coords: r.coords, reason: 'same_node' });
      continue;
    }
    const key = pairKey(r.uOut, r.vOut);
    const t = r.edge.type;
    const witnessed = r.edge.filterOk && ds1Pairs.some(p =>
      pairKey(p.a, p.b) === key && (p.type === 'other' || t === 'other' || t === p.type));
    if (witnessed) {
      removed.push({ id: r.id, sourceEdgeId: r.edge.id, coords: r.coords, reason: 'node_pair_duplicate' });
      continue;
    }
    pass1.push(r);
  }
  const ds2Out: Resolved[] = [];
  const collapsed = new Map<string, Resolved>();
  for (const r of [...pass1].sort((a, b) => byId(a.id, b.id))) {
    const key = `${pairKey(r.uOut!, r.vOut!)}|${r.edge.type}`;
    if (collapsed.has(key)) {
      removed.push({ id: r.id, sourceEdgeId: r.edge.id, coords: r.coords, reason: 'node_pair_duplicate' });
      continue;
    }
    collapsed.set(key, r);
    ds2Out.push(r);
  }

  // ── Phase 6.7: Pass 2, buffer coverage ──────────────────────────────────
  const edgeOf = new Map(edges1.map(e => [e.id, e]));
  const ds1Typed = ds1Out.map(o => ({ out: o, edge: edgeOf.get(o.sourceEdgeId)!, bbox: bboxOf(o.coords) }));
  const near = (a: [number, number, number, number], b: [number, number, number, number], r: number) =>
    a[0] - r <= b[2] && b[0] - r <= a[2] && a[1] - r <= b[3] && b[1] - r <= a[3];
  const coverage = new Map<string, { covered: number; along: boolean }>();
  for (const d of ds2Out) {
    const t = d.edge.type;
    const box = bboxOf(d.coords);
    const sameType = ds1Typed.filter(o => o.edge.type === t && near(o.bbox, box, edgeBufferDeg));
    const buffers = sameType.filter(o => o.edge.filterOk && lineDistance(d.coords, o.out.coords) <= edgeBufferDeg);
    const length = lineLength(d.coords);
    const covered = buffers.length && length > 0
      ? lengthWithin(d.coords, buffers.map(o => o.out.coords), edgeBufferDeg) / length
      : 0;
    const mid = interpolate(d.coords, 0.5);
    let nearest: (typeof sameType)[number] | undefined;
    let nearestD = Infinity;
    for (const o of sameType) {
      if (lineDistance(o.out.coords, d.coords) > edgeBufferDeg) continue;
      const dd = locate(o.out.coords, mid).distance;
      if (dd < nearestD || (dd === nearestD && nearest && byId(o.out.id, nearest.out.id) < 0)) {
        nearest = o;
        nearestD = dd;
      }
    }
    let along = true;
    if (nearest) {
      const f = locate(nearest.out.coords, mid).fraction;
      const pa = interpolate(nearest.out.coords, Math.max(f - TANGENT_PROBE, 0));
      const pb = interpolate(nearest.out.coords, Math.min(f + TANGENT_PROBE, 1));
      const tv = scale.toMetres([pb[0] - pa[0], pb[1] - pa[1]]);
      const first = d.coords[0]!;
      const last = d.coords[d.coords.length - 1]!;
      const chord = scale.toMetres([last[0] - first[0], last[1] - first[1]]);
      const chordLen = Math.hypot(...chord);
      along = chordLen < 0.1 ? true : Math.abs(tv[0] * chord[0] + tv[1] * chord[1]) >= ANGLE_COS * Math.hypot(...tv) * chordLen;
    }
    coverage.set(d.id, { covered, along });
  }

  // ── Phase 6.8: survivors ────────────────────────────────────────────────
  const shared = new Set<string>([...ds1Out.flatMap(o => [o.u, o.v]), ...ixnNodes.map(s => s.nodeId)]);
  const keep = new Set<string>();
  for (const d of ds2Out) {
    const { covered, along } = coverage.get(d.id)!;
    if (!d.edge.filterOk || covered < edgeOverlap || !along || (shared.has(d.uOut!) && shared.has(d.vOut!))) keep.add(d.id);
  }
  for (let added = true; added;) { // stranding guard: keep duplicates that kept edges hang off
    added = false;
    const used = new Set(ds2Out.filter(d => keep.has(d.id)).flatMap(d => [d.uOut!, d.vOut!]));
    for (const d of ds2Out) {
      if (keep.has(d.id)) continue;
      if ((!shared.has(d.uOut!) && used.has(d.uOut!)) || (!shared.has(d.vOut!) && used.has(d.vOut!))) {
        keep.add(d.id);
        added = true;
      }
    }
  }

  // ── Phase 6.9: output edges ─────────────────────────────────────────────
  const edgesOut: UnionEdge[] = [];
  const valid = (coords: LonLat[]) => coords.length >= 2 && lineLength(coords) > 0;
  for (const o of ds1Out) if (valid(o.coords)) edgesOut.push(o);
  for (const d of ds2Out) {
    if (!keep.has(d.id)) {
      removed.push({ id: d.id, sourceEdgeId: d.edge.id, coords: d.coords, reason: 'covered_duplicate' });
      continue;
    }
    if (!valid(d.coords)) continue;
    edgesOut.push({
      id: d.id, source: 'ds2', sourceEdgeId: d.edge.id, fractions: d.fractions,
      coords: d.coords, u: d.uOut!, v: d.vOut!, props: d.edge.props
    });
  }
  edgesOut.sort((a, b) => byId(a.id, b.id));

  // Orphan cleanup: keep only nodes an edge references.
  const referenced = new Set(edgesOut.flatMap(e => [e.u, e.v]));
  const nodesOut = [...outNodes.values()].filter(n => referenced.has(n.id)).sort((a, b) => byId(a.id, b.id));

  return {
    nodes: nodesOut,
    edges: edgesOut.map(e => ({ ...e, props: withoutKeys(e.props, ['_id', '_u_id', '_v_id']) })),
    removed,
    nodeMap: new Map([...nodeMap].map(([id, { snapped, outId, outLoc, snapDist, typeMatch }]) =>
      [id, { snapped, outId, outLoc, snapDist, typeMatch }])),
    scale
  };
}

/**
 * Keeps one split row per node (or per exact fraction when it has no node),
 * preferring rows with a node, then the smallest fraction; sorted by fraction.
 */
function dedupeSplits(rows: Split[]): Split[] {
  const byKey = new Map<string, Split>();
  for (const row of rows) {
    const key = row.nodeId ?? `frac:${pgFloatText(row.fraction)}`;
    const current = byKey.get(key);
    if (!current
      || (current.nodeId === null && row.nodeId !== null)
      || ((current.nodeId === null) === (row.nodeId === null) && row.fraction < current.fraction)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort((a, b) => a.fraction - b.fraction || byId(a.nodeId ?? '', b.nodeId ?? ''));
}

/**
 * Cuts an edge between consecutive split rows, replacing each piece's ends
 * with the rows' positions. Returns false if the edge yields no piece.
 */
function piecesOf(edge: Edge, rows: Split[], emit: (from: Split, to: Split, coords: LonLat[]) => void): boolean {
  let any = false;
  for (let i = 0; i + 1 < rows.length; i++) {
    const from = rows[i]!;
    const to = rows[i + 1]!;
    if (!(to.fraction > from.fraction)) continue;
    const sub = substring(edge.coords, from.fraction, to.fraction);
    const coords: LonLat[] = sub.length <= 2 ? [from.loc, to.loc] : [from.loc, ...sub.slice(1, -1), to.loc];
    if (coords.length < 2 || lineLength(coords) === 0) continue;
    emit(from, to, coords);
    any = true;
  }
  return any;
}
