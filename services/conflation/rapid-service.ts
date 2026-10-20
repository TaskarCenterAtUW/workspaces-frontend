/**
 * A Rapid service that conflates a TDEI OSW dataset into the workspace being
 * edited, tile by tile, and offers the results as Rapid suggestions.
 *
 * As the map shows each z16 tile of loaded workspace data, the service runs
 * the union (`unionDatasets`) on the workspace ways and TDEI features around
 * the tile, and shows the suggestions the tile owns (`tileSuggestions`).
 * Accepting one applies it through Rapid's `acceptFeature` hook: it can reuse
 * workspace nodes and split workspace ways, not just add new features. Tiles
 * are recomputed after edits, so accepted suggestions turn into workspace data
 * and later suggestions build on them.
 *
 * Registered with Rapid before it starts (see `Rapid3Manager`).
 */
import { lineLength } from '~/services/conflation/geometry';
import type { LonLat } from '~/services/conflation/geometry';
import { Ds2Data, ds1FromWays, expand, readOswArchive, tileBounds, tilesFor } from '~/services/conflation/inputs';
import type { WorkspaceWay } from '~/services/conflation/inputs';
import { isUnionMetadata, tileSuggestions } from '~/services/conflation/suggestions';
import type { Bounds, EdgeSuggestion, SuggestedEnd, Suggestion, TagSuggestion } from '~/services/conflation/suggestions';
import { unionDatasets } from '~/services/conflation/union';

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any;

export const CONFLATION_SERVICE_ID = 'tdeiConflation';

/** Tiles are computed at this zoom, matching Rapid's OSM data tiles. */
const TILE_ZOOM = 16;
/** Workspace and TDEI features within this many metres of a tile are included when computing it. */
const HALO_METRES = 30;

export interface ConflationDeps {
  /** Downloads a TDEI OSW dataset as a zip. */
  downloadOswDataset(tdeiDatasetId: string): Promise<Blob>;
}

interface Source {
  datasetID: string;
  tdeiDatasetId: string;
  proximity: number;
  data: Ds2Data;
  spatialID: string;
  graph: any;
  /** Suggestions per computed tile, keyed `x,y`. */
  tiles: Map<string, Suggestion[]>;
  dirty: Set<string>;
  suggestions: Map<string, Suggestion>;
}

/**
 * Builds the service class. Rapid constructs services itself (with only its
 * context), so the class closes over what it needs from the app.
 */
export function createConflationService(deps: ConflationDeps) {
  return class TdeiConflationService extends Rapid.AbstractSystem {
    _sources = new Map<string, Source>();

    constructor(context: any) {
      super(context);
      this.id = CONFLATION_SERVICE_ID;
      this.requiredDependencies = new Set(['editor', 'rapid', 'spatial']);
      this.optionalDependencies = new Set(['gfx']);
      this._markDirty = this._markDirty.bind(this);
    }

    initAsync() {
      if (this._initPromise) return this._initPromise;
      return this._initPromise = Promise.resolve();
    }

    startAsync() {
      if (this._startPromise) return this._startPromise;
      const editor = this.context.systems.editor;
      editor.on('stablechange', this._markDirty);
      editor.on('merge', this._markDirty);
      this._started = true;
      return this._startPromise = Promise.resolve();
    }

    resetAsync() {
      for (const source of this._sources.values()) {
        source.tiles.clear();
        source.dirty.clear();
        source.suggestions.clear();
        this.context.systems.spatial.clearCache(source.spatialID);
        source.graph = new Rapid.Graph(this.context);
      }
      return Promise.resolve();
    }

    /** Datasets are added at runtime with `addDatasetAsync`, so none at startup. */
    getAvailableDatasets() {
      return [];
    }

    /** Accepted suggestions are written by `acceptFeature`, so the dictionary just copies tags for display. */
    getDataDictionaryAsync(_datasetID: string) {
      const dictionary = new Rapid.RapidDataDictionary(this.context);
      dictionary.transforms = [{ order: 0, function: 'copy', source: '*', target: '*' }];
      return Promise.resolve(dictionary);
    }

    /**
     * Downloads a TDEI OSW dataset and adds it to Rapid as a dataset of
     * conflation suggestions, shown on the map from then on.
     * @param tdeiDatasetId - the TDEI dataset to conflate into the workspace
     * @param proximity - snapping radius in metres (TDEI's union defaults to 0.5)
     */
    async addDatasetAsync(tdeiDatasetId: string, proximity = 0.5) {
      const context = this.context;
      const rapid = context.systems.rapid;
      const data = new Ds2Data(await readOswArchive(await deps.downloadOswDataset(tdeiDatasetId)), `tdei-${tdeiDatasetId}`);
      if (!data.edgeCount && !data.nodeCount) throw new Error('That dataset has no OSW nodes or edges.');

      const datasetID = `tdei-conflation-${tdeiDatasetId}`;
      const dataset = new Rapid.RapidDataset(context, {
        id: datasetID,
        serviceID: CONFLATION_SERVICE_ID,
        categories: ['tdei'],
        color: '#00bbff',
        dataUsed: ['tdei', tdeiDatasetId],
        label: `TDEI dataset ${tdeiDatasetId}`,
        description: 'Features from a TDEI dataset, conflated into this workspace'
      });
      dataset.dictionary = await this.getDataDictionaryAsync(datasetID);
      context.systems.spatial.clearCache(dataset.spatialID);
      this._sources.set(datasetID, {
        datasetID, tdeiDatasetId, proximity, data, spatialID: dataset.spatialID,
        graph: new Rapid.Graph(context), tiles: new Map(), dirty: new Set(), suggestions: new Map()
      });
      rapid.catalog.set(datasetID, dataset);
      rapid.enableDatasets([datasetID]);
      context.systems.gfx?.deferredRedraw();
      return { datasetID, nodes: data.nodeCount, edges: data.edgeCount, bounds: data.bounds };
    }

    /** Computes suggestions for tiles in view that are new or out of date. */
    loadTiles(datasetID: string) {
      const source = this._sources.get(datasetID);
      if (!source) return;
      const context = this.context;
      const osm = context.services.osm;
      const extent = context.viewport.visibleExtent();
      const view: Bounds = [extent.min[0], extent.min[1], extent.max[0], extent.max[1]];
      let changed = false;
      for (const xy of tilesFor(view, TILE_ZOOM)) {
        const key = xy.join(',');
        if (source.tiles.has(key) && !source.dirty.has(key)) continue;
        const bounds = tileBounds(xy, TILE_ZOOM);
        const centre: LonLat = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
        if (osm && !osm.isDataLoaded(centre)) continue; // wait for the workspace data
        this._computeTile(source, key, bounds);
        changed = true;
      }
      if (changed) context.systems.gfx?.deferredRedraw();
    }

    getData(datasetID: string) {
      const source = this._sources.get(datasetID);
      if (!source) return [];
      return this.context.systems.spatial.getVisibleItems(source.spatialID).map((hit: any) => hit.contents);
    }

    graph(datasetID: string) {
      return this._sources.get(datasetID)?.graph;
    }

    /** Rapid's hook for accepting one of this service's suggestions. */
    acceptFeature(datasetID: string, entity: any) {
      const suggestion = this._sources.get(datasetID)?.suggestions.get(entity.id);
      if (!suggestion) return undefined;
      return suggestion.kind === 'edge' ? this._acceptEdge(suggestion) : this._acceptTags(suggestion);
    }

    _markDirty() {
      for (const source of this._sources.values()) {
        for (const key of source.tiles.keys()) source.dirty.add(key);
      }
    }

    _computeTile(source: Source, key: string, bounds: Bounds) {
      const context = this.context;
      const spatial = context.systems.spatial;
      const graph = context.systems.editor.staging.graph;
      const halo = HALO_METRES / (111111 * Math.cos((source.data.centreLat * Math.PI) / 180));
      const window = expand(bounds, halo);

      const ds1 = ds1FromWays(this._workspaceWays(graph, window));
      const ds2 = source.data.window(window);
      const result = unionDatasets(ds1, ds2, {
        proximity: source.proximity,
        centreLat: source.data.centreLat,
        label: `workspace+${source.tdeiDatasetId}`
      });
      const ds1Tags = new Map(ds1.nodes.map(n => [n.id, n.props as Record<string, string>]));
      const suggestions = tileSuggestions(result, bounds, ds1Tags, source.datasetID);

      // Replace this tile's suggestions.
      const previous = source.tiles.get(key) ?? [];
      for (const s of previous) source.suggestions.delete(s.id);
      spatial.removeItems(source.spatialID, previous.map(s => s.id));
      for (const s of suggestions) source.suggestions.set(s.id, s);
      source.tiles.set(key, suggestions);
      source.dirty.delete(key);

      // Rebuild the graph the suggestions are drawn from, then index this tile's.
      const all = [...source.suggestions.values()].flatMap(s => this._entitiesFor(source, s));
      source.graph = new Rapid.Graph(context);
      source.graph.rebase(all, [], true);
      const drawn = [...source.suggestions.keys()].map(id => source.graph.entity(id));
      if (drawn.length) spatial.replaceData(source.spatialID, drawn);
    }

    /** Workspace ways in the window, with their nodes. */
    _workspaceWays(graph: any, [w, s, e, n]: Bounds): WorkspaceWay[] {
      const toWorld = Rapid.sdk.projWgs84ToWorld;
      const a = toWorld([w, s]);
      const b = toWorld([e, n]);
      const box = { minX: Math.min(a[0], b[0]), minY: Math.min(a[1], b[1]), maxX: Math.max(a[0], b[0]), maxY: Math.max(a[1], b[1]) };
      const spatialID = this.context.systems.editor.spatialIDForGraph(graph);
      const ways = new Map<string, WorkspaceWay>();
      for (const hit of this.context.systems.spatial.getItemsAtBox(spatialID, box)) {
        const entity = graph.hasEntity(hit.id);
        if (entity?.type !== 'way' || ways.has(entity.id)) continue;
        const nodes = entity.nodes.map((id: string) => graph.hasEntity(id)).filter(Boolean);
        if (nodes.length !== entity.nodes.length) continue;
        ways.set(entity.id, {
          id: entity.id,
          tags: entity.tags,
          nodes: nodes.map((node: any) => ({ id: node.id, loc: node.loc, tags: node.tags }))
        });
      }
      return [...ways.values()];
    }

    /** The entities that draw a suggestion. */
    _entitiesFor(source: Source, s: Suggestion): any[] {
      const context = this.context;
      const meta = { serviceID: CONFLATION_SERVICE_ID, datasetID: source.datasetID };
      if (s.kind === 'tags') {
        return [new Rapid.OsmNode(context, { id: s.id, loc: s.loc, tags: { ...s.addTags, ...s.unionTags }, ...meta })];
      }
      const endNode = (end: SuggestedEnd) => new Rapid.OsmNode(context, {
        id: end.kind === 'existing' ? `n-${source.datasetID}-ws-${end.nodeId}` : `n-${source.datasetID}-${end.unionId}`,
        loc: end.loc,
        ...meta
      });
      const u = endNode(s.u);
      const v = endNode(s.v);
      const interior = s.interior.map((loc, i) => new Rapid.OsmNode(context, { id: `${s.id}-v${i}`, loc, ...meta }));
      const way = new Rapid.OsmWay(context, { id: s.id, nodes: [u.id, ...interior.map(n => n.id), v.id], tags: s.tags, ...meta });
      return [u, ...interior, v, way];
    }

    _acceptEdge(s: EdgeSuggestion) {
      const context = this.context;
      const newEnds = new Map<SuggestedEnd, any>();
      for (const end of [s.u, s.v]) {
        if (end.kind === 'new') newEnds.set(end, new Rapid.OsmNode(context, { loc: end.loc, tags: end.tags }));
      }
      const endId = (end: SuggestedEnd): string => (end.kind === 'existing' ? end.nodeId : newEnds.get(end).id);
      const interior = s.interior.map(loc => new Rapid.OsmNode(context, { loc }));
      const way = new Rapid.OsmWay(context, {
        nodes: [endId(s.u), ...interior.map(n => n.id), endId(s.v)],
        tags: Object.fromEntries(Object.entries(s.tags).filter(([k]) => !isUnionMetadata(k)))
      });

      const action = (graph: any) => {
        if ([s.u, s.v].some(end => end.kind === 'existing' && !graph.hasEntity(end.nodeId))) {
          return graph; // a workspace node it needs is gone: change nothing
        }
        // Splitting a way more than once: later splits look for the node in any of its pieces.
        const pieces = new Map<string, Set<string>>();
        for (const end of [s.u, s.v]) {
          if (end.kind === 'existing') {
            for (const wayId of end.splitWays) graph = splitWayAt(graph, wayId, end.nodeId, pieces);
          } else {
            const node = newEnds.get(end);
            graph = graph.replace(node).commit();
            for (const wayId of end.insertInto) {
              graph = insertIntoWay(graph, wayId, node.id, end.loc, pieces);
              graph = splitWayAt(graph, wayId, node.id, pieces);
            }
          }
        }
        return graph.replace([...interior, way]).commit();
      };
      return { action, acceptedIDs: [s.id], newID: way.id };
    }

    _acceptTags(s: TagSuggestion) {
      const action = (graph: any) => {
        const node = graph.hasEntity(s.nodeId);
        if (!node) return graph;
        const tags = { ...s.addTags, ...node.tags }; // never overwrite the workspace's own tags
        return graph.replace(node.update({ tags })).commit();
      };
      return { action, acceptedIDs: [s.id], newID: s.nodeId };
    }
  };
}

/** The way and the pieces split off it so far that still exist. */
function piecesOf(graph: any, wayId: string, pieces: Map<string, Set<string>>): any[] {
  return [wayId, ...(pieces.get(wayId) ?? [])].map(id => graph.hasEntity(id)).filter(Boolean);
}

/** Inserts a node into a way (or the piece of it nearest `loc`) at the segment nearest to `loc`. */
function insertIntoWay(graph: any, wayId: string, nodeId: string, loc: LonLat, pieces: Map<string, Set<string>>) {
  let way: any;
  let best = 0;
  let bestDist = Infinity;
  for (const candidate of piecesOf(graph, wayId, pieces)) {
    if (candidate.nodes.includes(nodeId)) return graph;
    const locs: LonLat[] = candidate.nodes.map((id: string) => graph.entity(id).loc);
    for (let i = 1; i < locs.length; i++) {
      const d = segmentDistance(loc, locs[i - 1]!, locs[i]!);
      if (d < bestDist) {
        way = candidate;
        best = i - 1;
        bestDist = d;
      }
    }
  }
  if (!way) return graph;
  const nodes = [...way.nodes.slice(0, best + 1), nodeId, ...way.nodes.slice(best + 1)];
  return graph.replace(way.update({ nodes })).commit();
}

function segmentDistance(p: LonLat, a: LonLat, b: LonLat) {
  const len = lineLength([a, b]);
  if (len === 0) return lineLength([p, a]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len)));
  return lineLength([p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]]);
}

/**
 * Splits a workspace way at one of its interior nodes. If the way was already
 * split (e.g. at the suggestion's other end), splits whichever piece now has
 * the node inside it, and records the new piece.
 */
function splitWayAt(graph: any, wayId: string, nodeId: string, pieces: Map<string, Set<string>>) {
  const target = piecesOf(graph, wayId, pieces)
    .find((w: any) => w.nodes.includes(nodeId) && w.first() !== nodeId && w.last() !== nodeId);
  if (!target) return graph;
  const split = Rapid.actionSplit([nodeId]).limitWays([target.id]);
  graph = split(graph);
  const created = pieces.get(wayId) ?? new Set<string>();
  for (const id of split.getCreatedWayIDs()) created.add(id);
  pieces.set(wayId, created);
  return graph;
}
