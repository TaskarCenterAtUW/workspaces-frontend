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
import { boundsOf, Ds2Data, ds1FromWays, expand, readOswArchive, tileBounds, tilesFor } from '~/services/conflation/inputs';
import type { WorkspaceWay } from '~/services/conflation/inputs';
import { isUnionMetadata, tileRemoved, tileSuggestions } from '~/services/conflation/suggestions';
import type { Bounds, EdgeSuggestion, RemovedPiece, SuggestedEnd, Suggestion, TagSuggestion } from '~/services/conflation/suggestions';
import { aroundOrder, spiralTiles } from '~/services/conflation/review';
import type { Rotation } from '~/services/conflation/review';
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

/** A Rapid dataset this service draws: its suggestions, or the pieces the union dropped. */
interface Layer<T extends { id: string }> {
  datasetID: string;
  spatialID: string;
  graph: any;
  /** Items per computed tile, keyed `x,y`. */
  byTile: Map<string, T[]>;
  items: Map<string, T>;
}

interface Source {
  datasetID: string;
  tdeiDatasetId: string;
  proximity: number;
  data: Ds2Data;
  /** Tiles computed so far, and those out of date since an edit. */
  tiles: Set<string>;
  dirty: Set<string>;
  suggestions: Layer<Suggestion>;
  /** View-only: TDEI edge pieces dropped as duplicates or for lacking endpoints. */
  removed: Layer<RemovedPiece>;
  /** Where review is up to: spiralling out from `centre`, `tiles` in that order. Unset until review starts. */
  review?: Review;
  /** Keys of the tiles holding TDEI data. */
  dataTiles: string[];
  /** Tag suggestions at or above this confidence are skipped in review; unset to review them all. */
  skipConfidence?: number;
  /** Whether tag suggestions that add `ext:osm_id` are skipped in review. */
  skipOsmId?: boolean;
}

const removedDatasetID = (datasetID: string) => `${datasetID}-removed`;

interface Review {
  centre: LonLat;
  rotation: Rotation;
  /** Tiles with TDEI data, spiralling out from the centre. */
  tiles: [number, number][];
  tile: number;
  /** The item under review: a suggestion, or a dropped edge picked on the map. */
  current?: Suggestion | RemovedPiece;
  order: (a: Suggestion, b: Suggestion) => number;
  /** Where review last left the map's centre; if the user has moved it since, review restarts there. */
  placed: LonLat;
}

/** Zooms used to frame the item under review: a single node, the range allowed, and padding around an edge. */
const FRAME_POINT_ZOOM = 21;
const FRAME_MIN_ZOOM = 18;
const FRAME_MAX_ZOOM = 22;
const FRAME_PADDING_ZOOM = 0.5;

/** How far (metres) the map can be from where review left it before review restarts from the new centre. */
const MOVED_METRES = 5;

/** Where review is up to in a dataset's suggestions. */
export interface ReviewPosition {
  /** The tile being reviewed, 1-based, of the tiles with TDEI data. */
  tile: number;
  tiles: number;
  /** The suggestion shown, 1-based, of the pending ones in that tile. */
  index: number;
  count: number;
  /** The suggestion shown, or undefined once there are none left in that direction. */
  suggestionID?: string;
}

/** What the conflation panel shows for the item under review. */
export interface ReviewItem {
  id: string;
  kind: 'edge' | 'tags' | 'removed';
  /** Tags it would write (edge, tags), or the dropped edge's tags (removed). */
  tags: Record<string, string>;
  /** Union metadata, shown but never written. */
  unionTags: Record<string, string>;
  /** How an edge joins the workspace, one line per end; or why an edge was dropped. */
  notes: string[];
  /** Whether it can be accepted or ignored (dropped edges can't). */
  actionable: boolean;
}

/** How many of a dataset's tiles have been reviewed. */
export interface ReviewStats {
  /** Tiles holding TDEI data. */
  tiles: number;
  /** Of those, tiles computed with no suggestions left to review. */
  reviewed: number;
  /** Tag suggestions skipped so far by the review filters (in computed tiles). */
  skipped: number;
}

/** How long to wait for a tile's workspace data before giving up on it. */
const TILE_WAIT_MS = 15000;

/** Where a suggestion is, for ordering and moving the map to it. */
function locOf(s: Suggestion): LonLat {
  return s.kind === 'tags' ? s.loc : (s.interior[Math.floor(s.interior.length / 2)] ?? s.u.loc);
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
      this.context.on('modechange', (mode: any) => this._modeChanged(mode));
      this._started = true;
      return this._startPromise = Promise.resolve();
    }

    /**
     * Our features are reviewed from the conflation panel, not Rapid's
     * suggestion panel: clicking one makes it the item under review instead.
     */
    _modeChanged(mode: any) {
      if (mode?.id !== 'select') return;
      for (const [id, datum] of mode.selectedData ?? []) {
        if (datum?.props?.serviceID !== CONFLATION_SERVICE_ID) continue;
        const found = this._lookup(datum.props.datasetID);
        if (!found) return;
        const item = found.layer.items.get(id);
        if (!item) return;
        // Let Rapid finish entering select mode before switching away from it.
        setTimeout(() => this._review(found.source, item), 0);
        return;
      }
    }

    /** Rapid's sidebar shows its suggestion panel on hover; skip that for our features. */
    _quietHover() {
      const sidebar = this.context.systems.ui?.Sidebar;
      if (!sidebar || sidebar._conflationQuiet) return;
      const hover = sidebar._hover;
      sidebar._hover = (target: any) => {
        if (target?.props?.serviceID === CONFLATION_SERVICE_ID) return;
        hover(target);
      };
      sidebar._conflationQuiet = true;
    }

    resetAsync() {
      for (const source of this._sources.values()) {
        source.tiles.clear();
        source.dirty.clear();
        for (const layer of [source.suggestions, source.removed]) {
          layer.byTile.clear();
          layer.items.clear();
          this.context.systems.spatial.clearCache(layer.spatialID);
          layer.graph = new Rapid.Graph(this.context);
        }
      }
      return Promise.resolve();
    }

    /** The source and layer behind a Rapid dataset id. */
    _lookup(datasetID: string): { source: Source; layer: Layer<Suggestion> | Layer<RemovedPiece> } | undefined {
      for (const source of this._sources.values()) {
        if (source.suggestions.datasetID === datasetID) return { source, layer: source.suggestions };
        if (source.removed.datasetID === datasetID) return { source, layer: source.removed };
      }
      return undefined;
    }

    /** Datasets are added at runtime with `addDatasetAsync`, so none at startup. */
    getAvailableDatasets() {
      return [];
    }

    /**
     * Accepted suggestions are written by `acceptFeature`, so the dictionary
     * just copies tags for display. Dropped pieces get none, so Rapid shows
     * them without Accept / Ignore.
     */
    getDataDictionaryAsync(datasetID: string) {
      const found = this._lookup(datasetID);
      if (found && found.layer === found.source.removed) return Promise.resolve(null);
      const dictionary = new Rapid.RapidDataDictionary(this.context);
      dictionary.transforms = [{ order: 0, function: 'copy', source: '*', target: '*' }];
      return Promise.resolve(dictionary);
    }

    /**
     * Downloads a TDEI OSW dataset and adds it to Rapid as a dataset of
     * conflation suggestions, shown on the map from then on. One dataset at a
     * time: remove the current one (`removeDataset`) before adding another.
     * @param tdeiDatasetId - the TDEI dataset to conflate into the workspace
     * @param proximity - snapping radius in metres (TDEI's union defaults to 0.5)
     */
    async addDatasetAsync(tdeiDatasetId: string, proximity = 0.5) {
      if (this._sources.size) throw new Error('A dataset is already being conflated; remove it first.');
      this._quietHover();
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
      const removed = new Rapid.RapidDataset(context, {
        id: removedDatasetID(datasetID),
        serviceID: CONFLATION_SERVICE_ID,
        categories: ['tdei'],
        color: '#9e9e9e',
        dataUsed: ['tdei', tdeiDatasetId],
        label: `TDEI dataset ${tdeiDatasetId}: dropped`,
        description: 'TDEI edges the union dropped as duplicates of workspace data, or for lacking endpoints'
      });
      const layer = (ds: any) => {
        context.systems.spatial.clearCache(ds.spatialID);
        return { datasetID: ds.id, spatialID: ds.spatialID, graph: new Rapid.Graph(context), byTile: new Map(), items: new Map() };
      };
      this._sources.set(datasetID, {
        datasetID, tdeiDatasetId, proximity, data, tiles: new Set(), dirty: new Set(),
        suggestions: layer(dataset), removed: layer(removed),
        dataTiles: data.tilesWithData(TILE_ZOOM).map(xy => xy.join(','))
      });
      dataset.dictionary = await this.getDataDictionaryAsync(datasetID);
      rapid.catalog.set(datasetID, dataset);
      rapid.catalog.set(removed.id, removed);
      rapid.enableDatasets([datasetID]);
      rapid.addDatasets([removed.id]); // listed in Rapid's menu, off until shown
      context.systems.gfx?.deferredRedraw();
      return { datasetID, removedDatasetID: removed.id, nodes: data.nodeCount, edges: data.edgeCount, bounds: data.bounds };
    }

    /** Zooms the map to fit a dataset's whole extent. */
    zoomToDataset(datasetID: string) {
      const source = this._sources.get(datasetID);
      if (!source) return;
      const [w, s, e, n] = source.data.bounds;
      const map = this.context.systems.map;
      const zoom = (e > w || n > s) ? map.extentZoom(new Rapid.sdk.Extent([w, s], [e, n])) - FRAME_PADDING_ZOOM : FRAME_POINT_ZOOM;
      map.centerZoomEase([(w + e) / 2, (s + n) / 2], Math.min(FRAME_MAX_ZOOM, zoom));
    }

    /** Stops conflating a dataset: removes its suggestions and dropped edges from Rapid. */
    removeDataset(datasetID: string) {
      const source = this._sources.get(datasetID);
      if (!source) return;
      const context = this.context;
      const rapid = context.systems.rapid;
      const layers = [source.suggestions, source.removed];
      if (context.mode?.id === 'select') context.enter('browse'); // a suggestion may be selected
      rapid.removeDatasets(layers.map(l => l.datasetID));
      for (const layer of layers) {
        rapid.catalog.delete(layer.datasetID);
        context.systems.spatial.clearCache(layer.spatialID);
      }
      this._sources.delete(datasetID);
      context.systems.gfx?.deferredRedraw();
      this.emit('reviewchange');
    }

    /** How many of a dataset's tiles have been reviewed, and how many confident suggestions were skipped. */
    reviewStats(datasetID: string): ReviewStats {
      const source = this._sources.get(datasetID);
      if (!source) return { tiles: 0, reviewed: 0, skipped: 0 };
      const reviewed = source.dataTiles.filter(key => source.tiles.has(key)
        && !(source.suggestions.byTile.get(key) ?? []).some(s => this._needsReview(source, s))).length;
      const skipped = [...source.suggestions.items.values()].filter(s => this._skipped(source, s)).length;
      return { tiles: source.dataTiles.length, reviewed, skipped };
    }

    /**
     * Skips tag suggestions the union is at least this confident about in
     * review (they stay on the map); `undefined` reviews them all.
     */
    setSkipConfidence(datasetID: string, threshold: number | undefined) {
      const source = this._sources.get(datasetID);
      if (!source) return;
      source.skipConfidence = threshold;
      this.emit('reviewchange');
    }

    /** Skips tag suggestions that add `ext:osm_id` in review (they stay on the map). */
    setSkipOsmId(datasetID: string, skip: boolean) {
      const source = this._sources.get(datasetID);
      if (!source) return;
      source.skipOsmId = skip;
      this.emit('reviewchange');
    }

    /** Whether a pending suggestion is skipped in review by the review filters. */
    _skipped(source: Source, s: Suggestion): boolean {
      if (s.kind !== 'tags' || this.context.systems.rapid.isAcceptedOrIgnored(s.id)) return false;
      const confident = source.skipConfidence !== undefined && s.confidence !== undefined && s.confidence >= source.skipConfidence;
      const addsOsmId = !!source.skipOsmId && 'ext:osm_id' in s.addTags;
      return confident || addsOsmId;
    }

    /** Whether a suggestion still needs review: not accepted, ignored, or skipped by a filter. */
    _needsReview(source: Source, s: Suggestion): boolean {
      return !this.context.systems.rapid.isAcceptedOrIgnored(s.id) && !this._skipped(source, s);
    }

    /** Shows or hides the TDEI edges the union dropped, for a dataset added with `addDatasetAsync`. */
    showRemoved(datasetID: string, show: boolean) {
      const rapid = this.context.systems.rapid;
      if (show) rapid.enableDatasets([removedDatasetID(datasetID)]);
      else rapid.disableDatasets([removedDatasetID(datasetID)]);
    }

    /**
     * Starts review over, spiralling out from a point (the centre of the map
     * view if not given), clockwise or counterclockwise.
     */
    startReview(datasetID: string, rotation: Rotation = 'clockwise', centre?: LonLat) {
      const source = this._sources.get(datasetID);
      if (!source) throw new Error(`No conflation dataset ${datasetID}`);
      const from = centre ?? this.context.systems.map.center();
      source.review = {
        centre: from,
        placed: from,
        rotation,
        tiles: spiralTiles(source.dataTiles.map(key => key.split(',').map(Number) as [number, number]), from, TILE_ZOOM, rotation),
        tile: 0,
        order: aroundOrder<Suggestion>(from, rotation, locOf, s => s.id)
      };
    }

    /**
     * Moves to the next (or previous) pending suggestion and selects it, so
     * Rapid's sidebar shows it with Accept / Ignore. Spirals out from where
     * review started (see `startReview`; the map centre if not started), tile by
     * tile, moving the map to each and waiting for its workspace data, and
     * skipping tiles with nothing pending.
     * @param direction - 1 for the next suggestion, -1 for the previous
     * @param onSearch - called with each tile searched (1-based) and the tile count
     */
    async reviewStepAsync(datasetID: string, direction: 1 | -1, onSearch?: (tile: number, tiles: number) => void): Promise<ReviewPosition> {
      const source = this._sources.get(datasetID);
      if (!source) throw new Error(`No conflation dataset ${datasetID}`);
      // Spiral out from the view's centre: restart there if the user has moved the map since review last did.
      const centre: LonLat = this.context.systems.map.center();
      const last = source.review;
      if (!last || source.data.metres(centre, last.placed) > MOVED_METRES) {
        this.startReview(datasetID, last?.rotation ?? 'clockwise', centre);
      }
      const review = source.review!;
      const tiles = review.tiles;
      let tile = review.tile;
      // A dropped edge picked on the map has no place in the order: start that tile from its beginning.
      let current: Suggestion | undefined = review.current?.kind === 'removed' ? undefined : review.current;
      while (tile >= 0 && tile < tiles.length) {
        onSearch?.(tile + 1, tiles.length);
        const pending = await this._pendingInTileAsync(source, tiles[tile]!, review.order);
        let next: Suggestion | undefined;
        if (current) {
          next = direction > 0
            ? pending.find(s => review.order(s, current!) > 0)
            : [...pending].reverse().find(s => review.order(s, current!) < 0);
        } else {
          next = direction > 0 ? pending[0] : pending.at(-1);
        }
        if (next) {
          review.tile = tile;
          review.current = next;
          this._show(source, next);
          this.emit('reviewchange');
          return { tile: tile + 1, tiles: tiles.length, index: pending.indexOf(next) + 1, count: pending.length, suggestionID: next.id };
        }
        tile += direction;
        current = undefined;
      }
      // Nothing further that way; stay where we were.
      return { tile: review.tile + 1, tiles: tiles.length, index: 0, count: 0 };
    }

    /** A tile's pending suggestions in review order, computing the tile first if needed. */
    async _pendingInTileAsync(source: Source, xy: [number, number], order: (a: Suggestion, b: Suggestion) => number): Promise<Suggestion[]> {
      const key = xy.join(',');
      if (!source.tiles.has(key) || source.dirty.has(key)) {
        const bounds = tileBounds(xy, TILE_ZOOM);
        const map = this.context.systems.map;
        const middle: LonLat = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
        map.centerZoom(middle, Math.max(map.zoom(), 17));
        if (source.review) source.review.placed = middle;
        const started = Date.now();
        while (!source.tiles.has(key) || source.dirty.has(key)) {
          if (Date.now() - started > TILE_WAIT_MS) return []; // workspace data never arrived: skip the tile
          await new Promise(resolve => setTimeout(resolve, 250));
          this.loadTiles(source.datasetID);
        }
      }
      return (source.suggestions.byTile.get(key) ?? [])
        .filter(s => this._needsReview(source, s))
        .sort(order);
    }

    /** Moves the map to a suggestion and selects it. */
    /**
     * Shows the item under review: a tag suggestion selects the workspace node
     * it changes (so its regular editor shows); an edge suggestion or dropped
     * edge is highlighted with nothing selected.
     */
    _show(source: Source, item: Suggestion | RemovedPiece, move = true) {
      const context = this.context;
      const layer = context.systems.gfx?.scene?.layers?.get('rapid');
      layer?.clearClass('highlight');
      if (move) {
        const to = this._frame(item);
        if (source.review) source.review.placed = to;
      }
      if (item.kind === 'tags' && context.systems.editor.staging.graph.hasEntity(item.nodeId)) {
        context.enter('select-osm', { selection: { osm: [item.nodeId] } });
      } else {
        context.enter('browse');
        layer?.setClass('highlight', item.id);
      }
      context.systems.gfx?.immediateRedraw();
    }

    /**
     * Zooms the map in on an item: an edge fills most of the view, a single
     * node zooms to 21. Returns the centre it moved to.
     */
    _frame(item: Suggestion | RemovedPiece): LonLat {
      const map = this.context.systems.map;
      const coords: LonLat[] = item.kind === 'removed'
        ? item.coords
        : item.kind === 'tags'
          ? [item.loc]
          : [item.u.loc, ...item.interior, item.v.loc];
      const [w, s, e, n] = boundsOf(coords);
      const centre: LonLat = [(w + e) / 2, (s + n) / 2];
      let zoom = FRAME_POINT_ZOOM;
      if (e > w || n > s) {
        zoom = map.extentZoom(new Rapid.sdk.Extent([w, s], [e, n])) - FRAME_PADDING_ZOOM;
      }
      map.centerZoomEase(centre, Math.min(FRAME_MAX_ZOOM, Math.max(FRAME_MIN_ZOOM, zoom)));
      return centre;
    }

    /** Makes an item the one under review (e.g. picked on the map), and shows it. */
    _review(source: Source, item: Suggestion | RemovedPiece) {
      if (!source.review) this.startReview(source.datasetID);
      const review = source.review!;
      const key = [...(item.kind === 'removed' ? source.removed.byTile : source.suggestions.byTile)]
        .find(([, items]) => items.some((x: { id: string }) => x.id === item.id))?.[0];
      const tile = review.tiles.findIndex(xy => xy.join(',') === key);
      if (tile >= 0) review.tile = tile;
      review.current = item;
      this._show(source, item, false);
      this.emit('reviewchange');
    }

    /** The item under review, as the panel shows it. */
    currentItem(datasetID: string): ReviewItem | undefined {
      const item = this._sources.get(datasetID)?.review?.current;
      if (!item) return undefined;
      const rapid = this.context.systems.rapid;
      if (item.kind === 'removed') {
        const { 'ext:union_removed': reason, ...tags } = item.tags;
        return { id: item.id, kind: 'removed', tags, unionTags: {}, notes: [reason ?? 'Dropped by the union'], actionable: false };
      }
      const actionable = !rapid.isAcceptedOrIgnored(item.id);
      if (item.kind === 'tags') {
        return { id: item.id, kind: 'tags', tags: item.addTags, unionTags: item.unionTags, notes: [`Adds tags to workspace node ${item.nodeId}`], actionable };
      }
      const describe = (end: SuggestedEnd, which: string) => {
        if (end.kind === 'existing') {
          const split = end.splitWays.length ? `, splitting ${end.splitWays.join(', ')}` : '';
          return `${which} joins workspace node ${end.nodeId}${split}`;
        }
        const into = end.insertInto.length ? `, inserted into ${end.insertInto.join(', ')} and splitting it` : '';
        return `${which} is a new node${into}`;
      };
      return {
        id: item.id, kind: 'edge', tags: item.tags, unionTags: {},
        notes: [describe(item.u, 'Start'), describe(item.v, 'End')], actionable
      };
    }

    /** Accepts the suggestion under review and selects what it added or changed. */
    acceptCurrent(datasetID: string) {
      const source = this._sources.get(datasetID);
      const item = source?.review?.current;
      if (!source || !item || item.kind === 'removed') return;
      const entity = source.suggestions.graph.hasEntity(item.id);
      if (!entity) return;
      const context = this.context;
      const editor = context.systems.editor;
      const action = Rapid.actionRapidAcceptFeature(entity);
      editor.perform(action);
      const newID = action.getNewID();
      // The same annotation Rapid's suggestion panel uses, so Rapid tracks it as accepted.
      editor.commit({
        annotation: {
          type: 'rapid_accept_feature',
          description: 'Accepted a TDEI suggestion',
          acceptIDs: [...action.getAcceptedIDs()],
          dataUsed: ['tdei', source.tdeiDatasetId]
        },
        selectedIDs: newID ? [newID] : undefined
      });
      context.systems.gfx?.scene?.layers?.get('rapid')?.clearClass('highlight');
      if (newID) context.enter('select-osm', { selection: { osm: [newID] } });
      this.emit('reviewchange');
    }

    /** Ignores the suggestion under review. */
    ignoreCurrent(datasetID: string) {
      const source = this._sources.get(datasetID);
      const item = source?.review?.current;
      if (!source || !item || item.kind === 'removed') return;
      const context = this.context;
      const editor = context.systems.editor;
      // The same annotation Rapid's suggestion panel uses, so Rapid tracks it as ignored.
      editor.perform(Rapid.actionNoop());
      editor.commit({ annotation: { type: 'rapid_ignore_feature', description: 'Ignored a TDEI suggestion', ignoreID: item.id } });
      context.systems.gfx?.scene?.layers?.get('rapid')?.clearClass('highlight');
      context.enter('browse');
      this.emit('reviewchange');
    }

    /** Computes suggestions for tiles in view that are new or out of date. */
    loadTiles(datasetID: string) {
      const source = this._lookup(datasetID)?.source;
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
      const layer = this._lookup(datasetID)?.layer;
      if (!layer) return [];
      return this.context.systems.spatial.getVisibleItems(layer.spatialID).map((hit: any) => hit.contents);
    }

    graph(datasetID: string) {
      return this._lookup(datasetID)?.layer.graph;
    }

    /** Rapid's hook for accepting one of this service's suggestions. */
    acceptFeature(datasetID: string, entity: any) {
      const suggestion = this._sources.get(datasetID)?.suggestions.items.get(entity.id);
      if (!suggestion) return undefined;
      return suggestion.kind === 'edge' ? this._acceptEdge(suggestion) : this._acceptTags(suggestion);
    }

    _markDirty() {
      for (const source of this._sources.values()) {
        for (const key of source.tiles) source.dirty.add(key);
      }
      this.emit('reviewchange'); // accepting or ignoring changes what's left to review
    }

    _computeTile(source: Source, key: string, bounds: Bounds) {
      const context = this.context;
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
      this._replaceTile(source.suggestions, key, tileSuggestions(result, bounds, ds1Tags, source.datasetID));
      this._replaceTile(source.removed, key, tileRemoved(result, bounds, source.datasetID));
      source.tiles.add(key);
      source.dirty.delete(key);
      this.emit('reviewchange');
    }

    /** Swaps a tile's items in a layer, then rebuilds the graph they're drawn from and reindexes them. */
    _replaceTile<T extends Suggestion | RemovedPiece>(layer: Layer<T>, key: string, items: T[]) {
      const context = this.context;
      const spatial = context.systems.spatial;
      const previous = layer.byTile.get(key) ?? [];
      for (const item of previous) layer.items.delete(item.id);
      spatial.removeItems(layer.spatialID, previous.map(item => item.id));
      for (const item of items) layer.items.set(item.id, item);
      layer.byTile.set(key, items);

      const all = [...layer.items.values()].flatMap(item => this._entitiesFor(layer.datasetID, item));
      layer.graph = new Rapid.Graph(context);
      layer.graph.rebase(all, [], true);
      const drawn = [...layer.items.keys()].map(id => layer.graph.entity(id));
      if (drawn.length) spatial.replaceData(layer.spatialID, drawn);
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

    /** The entities that draw a suggestion or a dropped piece. */
    _entitiesFor(datasetID: string, s: Suggestion | RemovedPiece): any[] {
      const context = this.context;
      const meta = { serviceID: CONFLATION_SERVICE_ID, datasetID };
      if (s.kind === 'removed') {
        const nodes = s.coords.map((loc, i) => new Rapid.OsmNode(context, { id: `${s.id}-v${i}`, loc, ...meta }));
        return [...nodes, new Rapid.OsmWay(context, { id: s.id, nodes: nodes.map(n => n.id), tags: s.tags, ...meta })];
      }
      if (s.kind === 'tags') {
        return [new Rapid.OsmNode(context, { id: s.id, loc: s.loc, tags: { ...s.addTags, ...s.unionTags }, ...meta })];
      }
      const endNode = (end: SuggestedEnd) => new Rapid.OsmNode(context, {
        id: end.kind === 'existing' ? `n-${datasetID}-ws-${end.nodeId}` : `n-${datasetID}-${end.unionId}`,
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
