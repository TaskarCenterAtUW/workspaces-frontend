/**
 * Inputs to the union: a TDEI OSW dataset (DS2), read once and windowed per
 * tile, and the workspace's own data (DS1), taken from Rapid's graph.
 */
import { BlobReader, BlobWriter, TextWriter, ZipReader } from '@zip.js/zip.js';
import type { Entry, FileEntry } from '@zip.js/zip.js';
import type { LonLat } from '~/services/conflation/geometry';
import type { Bounds } from '~/services/conflation/suggestions';
import type { Props, UnionDataset } from '~/services/conflation/union';

interface Feature {
  geometry: { type: string; coordinates: unknown } | null;
  properties: Props | null;
}

export interface OswData {
  nodes: Feature[];
  edges: Feature[];
}

const isFile = (e: Entry): e is FileEntry => !e.directory;

/**
 * Reads the nodes and edges of an OSW dataset from TDEI's download: a zip of
 * `*.nodes.geojson`, `*.edges.geojson` and so on, possibly wrapped in another
 * zip alongside the dataset's metadata.
 */
export async function readOswArchive(blob: Blob): Promise<OswData> {
  const reader = new ZipReader(new BlobReader(blob));
  try {
    const entries = (await reader.getEntries()).filter(isFile);
    const nested = entries.find(e => e.filename.endsWith('.zip'));
    if (nested && !entries.some(e => e.filename.endsWith('.geojson'))) {
      return await readOswArchive(await nested.getData!(new BlobWriter()));
    }
    const read = async (suffix: string) => {
      const entry = entries.find(e => e.filename.endsWith(suffix));
      if (!entry) return [];
      const json = JSON.parse(await entry.getData!(new TextWriter()));
      return (json.features ?? []) as Feature[];
    };
    return { nodes: await read('nodes.geojson'), edges: await read('edges.geojson') };
  } finally {
    await reader.close();
  }
}

interface IndexedEdge {
  id: string;
  coords: LonLat[];
  props: Props;
  bbox: Bounds;
}

/** A TDEI dataset's nodes and edges, indexed for pulling out the part around a tile. */
export class Ds2Data {
  readonly #nodes: { id: string; loc: LonLat; props: Props }[];
  readonly #edges: IndexedEdge[];
  readonly #nodesByCoord = new Map<string, { id: string; loc: LonLat; props: Props }[]>();
  readonly #cells = new Map<string, IndexedEdge[]>();
  readonly #nodeCells = new Map<string, { id: string; loc: LonLat; props: Props }[]>();
  /** Grid cell size in degrees. */
  readonly #cell = 0.005;
  /** The dataset's bounds. */
  readonly bounds: Bounds;

  constructor(data: OswData, readonly prefix = 'tdei') {
    this.#nodes = data.nodes.flatMap((f, i) => {
      if (f.geometry?.type !== 'Point') return [];
      const props = f.properties ?? {};
      return [{ id: `${prefix}:n:${props._id ?? i}`, loc: f.geometry.coordinates as LonLat, props }];
    });
    this.#edges = data.edges.flatMap((f, i) => {
      if (f.geometry?.type !== 'LineString') return [];
      const coords = f.geometry.coordinates as LonLat[];
      if (coords.length < 2) return [];
      const props = f.properties ?? {};
      return [{ id: `${prefix}:e:${props._id ?? i}`, coords, props, bbox: boundsOf(coords) }];
    });
    for (const node of this.#nodes) {
      const key = `${node.loc[0]},${node.loc[1]}`;
      this.#nodesByCoord.set(key, [...(this.#nodesByCoord.get(key) ?? []), node]);
      const cell = this.#cellKey(node.loc[0], node.loc[1]);
      this.#nodeCells.set(cell, [...(this.#nodeCells.get(cell) ?? []), node]);
    }
    for (const edge of this.#edges) {
      for (const key of this.#cellsOf(edge.bbox)) this.#cells.set(key, [...(this.#cells.get(key) ?? []), edge]);
    }
    const all = [...this.#nodes.map(n => n.loc), ...this.#edges.flatMap(e => e.coords)];
    this.bounds = all.length ? boundsOf(all) : [0, 0, 0, 0];
  }

  get nodeCount() {
    return this.#nodes.length;
  }

  get edgeCount() {
    return this.#edges.length;
  }

  /**
   * The tiles at a zoom that hold any of the dataset's nodes or edge vertices,
   * in reading order (north to south, then west to east).
   */
  tilesWithData(zoom: number): [number, number][] {
    const keys = new Map<string, [number, number]>();
    for (const loc of [...this.#nodes.map(n => n.loc), ...this.#edges.flatMap(e => e.coords)]) {
      const xy = tileAt(loc, zoom);
      keys.set(xy.join(','), xy);
    }
    return [...keys.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }

  /** Approximate metres between two points near the dataset. */
  metres(a: LonLat, b: LonLat): number {
    const mPerDegLon = 111111 * Math.cos((this.centreLat * Math.PI) / 180);
    return Math.hypot((a[0] - b[0]) * mPerDegLon, (a[1] - b[1]) * 111111);
  }

  /** The latitude at the dataset's centre, for a fixed metres-per-degree scale. */
  get centreLat() {
    return (this.bounds[1] + this.bounds[3]) / 2;
  }

  #cellKey(x: number, y: number) {
    return `${Math.floor(x / this.#cell)},${Math.floor(y / this.#cell)}`;
  }

  * #cellsOf([w, s, e, n]: Bounds) {
    for (let x = Math.floor(w / this.#cell); x <= Math.floor(e / this.#cell); x++) {
      for (let y = Math.floor(s / this.#cell); y <= Math.floor(n / this.#cell); y++) yield `${x},${y}`;
    }
  }

  /**
   * Every edge touching the window, in full, with the nodes at their vertices,
   * plus the nodes inside the window.
   */
  window(requested: Bounds): UnionDataset {
    if (!overlaps(requested, this.bounds)) return { nodes: [], edges: [] };
    // Only the part that overlaps the dataset has cells to visit.
    const bounds: Bounds = [
      Math.max(requested[0], this.bounds[0]), Math.max(requested[1], this.bounds[1]),
      Math.min(requested[2], this.bounds[2]), Math.min(requested[3], this.bounds[3])
    ];
    const edges = new Map<string, IndexedEdge>();
    for (const key of this.#cellsOf(bounds)) {
      for (const edge of this.#cells.get(key) ?? []) {
        if (overlaps(edge.bbox, bounds)) edges.set(edge.id, edge);
      }
    }
    const nodes = new Map<string, { id: string; loc: LonLat; props: Props }>();
    for (const key of this.#cellsOf(bounds)) {
      for (const node of this.#nodeCells.get(key) ?? []) {
        if (contains(bounds, node.loc)) nodes.set(node.id, node);
      }
    }
    for (const edge of edges.values()) {
      for (const c of edge.coords) {
        for (const node of this.#nodesByCoord.get(`${c[0]},${c[1]}`) ?? []) nodes.set(node.id, node);
      }
    }
    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()].map(({ id, coords, props }) => ({ id, coords, props }))
    };
  }
}

/** A workspace way, as Rapid's graph has it. */
export interface WorkspaceWay {
  id: string;
  tags: Record<string, string>;
  nodes: { id: string; loc: LonLat; tags: Record<string, string> }[];
}

/**
 * DS1 from workspace ways: each line with a `highway` tag is an edge, and its
 * nodes are DS1 nodes. Areas (closed ways tagged `area=yes`) are left out.
 */
export function ds1FromWays(ways: WorkspaceWay[]): UnionDataset {
  const nodes = new Map<string, { id: string; loc: LonLat; props: Props }>();
  const edges: UnionDataset['edges'] = [];
  for (const way of ways) {
    if (!way.tags.highway || way.nodes.length < 2) continue;
    const closed = way.nodes[0]!.id === way.nodes[way.nodes.length - 1]!.id;
    if (closed && way.tags.area === 'yes') continue;
    edges.push({ id: way.id, coords: way.nodes.map(n => n.loc), props: { ...way.tags } });
    for (const n of way.nodes) nodes.set(n.id, { id: n.id, loc: n.loc, props: { ...n.tags } });
  }
  return { nodes: [...nodes.values()], edges };
}

export function boundsOf(coords: LonLat[]): Bounds {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of coords) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}

export const overlaps = (a: Bounds, b: Bounds) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const contains = (b: Bounds, p: LonLat) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

/** Grows bounds by a margin in degrees. */
export const expand = ([w, s, e, n]: Bounds, d: number): Bounds => [w - d, s - d, e + d, n + d];

/** Web Mercator tiles covering bounds at a zoom, as [x, y] pairs. */
export function tilesFor([w, s, e, n]: Bounds, zoom: number): [number, number][] {
  const [x0, y0] = tileAt([w, n], zoom);
  const [x1, y1] = tileAt([e, s], zoom);
  const out: [number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
}

export function tileAt([lon, lat]: LonLat, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

/** A tile's lon/lat bounds. */
export function tileBounds([x, y]: [number, number], zoom: number): Bounds {
  const n = 2 ** zoom;
  const lon = (tx: number) => (tx / n) * 360 - 180;
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}
