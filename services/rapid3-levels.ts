import { computed, ref, shallowRef } from 'vue';
import {
  collectLevels,
  boxesOverlap,
  buildStationIndex,
  isHiddenInView,
  isLevelArea,
  isOutsideView,
  farStops,
  highlightedStationIds,
  largeLevelAreas,
  levelAreaIndex,
  levelAreasMissingId,
  levelBoxCorners,
  levelsByStation,
  levelsLowestFirst,
  nextLevelIndex,
  renumberedLevelIndexes,
  reorderedLevelIndexes,
  stationExtents,
  isPathway,
  stopLevelId,
  stopNodes,
  stopsByLevel,
  suggestLevelId,
  unleveledStops
} from '~/services/pathways-levels';
import type { Level, LevelView, LonLatBox, StationIndex, StationLevelGroup } from '~/services/pathways-levels';
import { suggestedStopIds } from '~/services/gtfs-references';
import { gtfsValueLabel } from '~/services/gtfs-value-labels';

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any;

/** The filter ID Rapid reports for features hidden because they're on another level. */
export const LEVEL_FILTER_ID = 'gtfs_other_levels';

/**
 * The dark box behind a highlighted station: its fill, padding past its
 * stops, and the label in its top-left corner (sized in screen pixels). The
 * label uses Rapid's map label font and outline (PixiLayerLabels), with the
 * colors swapped: white text outlined in black.
 */
export const STATION_HIGHLIGHT = {
  color: 0x000000,
  alpha: 0.5,
  paddingMeters: 15,
  label: (stationName: string) => `Extent of Station ${stationName}`,
  labelStyle: {
    fill: { color: 0xffffff },
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: 12,
    fontWeight: '600',
    stroke: { color: 0x000000, width: 3, join: 'round' }
  },
  labelInsetPx: 4
};

/** Opacity of stops on the map only as the far end of a shown connection. */
export const FAR_END_ALPHA = 0.35;

/**
 * The tag on a level outline naming its reference data: the drawing the level
 * was made from, as GeoJSON (pathways-converter writes it, as a TDEI API path).
 */
export const REFERENCE_URL_TAG = 'ext:reference_url';

/**
 * How reference drawings are drawn: each feature's line in the color for what
 * it is (its `role`, from pathways-converter), bright enough to read over
 * aerial imagery. Linework the converter couldn't classify uses `defaultColor`.
 */
export const REFERENCE_STYLE = {
  alpha: 0.9,
  defaultColor: 0xaeea00, // unclassified linework: lime
  roleColors: {
    barrier: 0xe040fb, // walls: purple
    platform: 0xffffff,
    platform_edge: 0xffea00,
    door: 0xffab40,
    entrance: 0x69f0ae,
    stair: 0xff6d00,
    escalator: 0x00e5ff,
    moving_walk: 0x1de9b6,
    elevator: 0x448aff,
    fare_gate: 0xff1744,
    ticket_machine: 0xff80ab
  } as Record<string, number>,
  /** How the legend names each role. */
  roleNames: {
    barrier: 'Walls',
    platform: 'Platform',
    platform_edge: 'Platform edge',
    door: 'Doors',
    entrance: 'Entrances',
    stair: 'Stairs',
    escalator: 'Escalators',
    moving_walk: 'Moving walks',
    elevator: 'Elevators',
    fare_gate: 'Fare gates',
    ticket_machine: 'Ticket machines'
  } as Record<string, string>
};

/** A legend entry for a reference drawing: a role's name and color. */
export interface ReferenceLegendEntry {
  label: string;
  color: string;
}

/** The legend for drawn paths: each role they use, in REFERENCE_STYLE order, then unclassified linework. */
export function referenceLegend(paths: { role?: string }[]): ReferenceLegendEntry[] {
  const used = new Set(paths.map(path => path.role ?? ''));
  const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  const entries = Object.entries(REFERENCE_STYLE.roleColors)
    .filter(([role]) => used.has(role))
    .map(([role, color]) => ({ label: REFERENCE_STYLE.roleNames[role] ?? role, color: hex(color) }));
  if ([...used].some(role => !(role in REFERENCE_STYLE.roleColors))) {
    entries.push({ label: 'Other linework', color: hex(REFERENCE_STYLE.defaultColor) });
  }
  return entries;
}

/** The reference URLs on a level's outlines (a level may have several outlines). */
export function referenceUrls(entities: any[], levelId: string): string[] {
  const urls = entities
    .filter(entity => isLevelArea(entity) && entity.tags?.level_id?.trim() === levelId)
    .map(area => String(area.tags?.[REFERENCE_URL_TAG] ?? '').trim())
    .filter(Boolean);
  return [...new Set(urls)];
}

/** A reference drawing's lines: each [lon, lat] path, with the color for its feature's role. */
export function referencePaths(geojson: any): { role?: string; color: number; coordinates: [number, number][]; closed: boolean }[] {
  const features = geojson?.type === 'FeatureCollection' ? geojson.features ?? [] : [geojson];
  const paths: { role?: string; color: number; coordinates: [number, number][]; closed: boolean }[] = [];
  for (const feature of features) {
    const geometry = feature?.geometry;
    const role: string | undefined = feature?.properties?.role ?? undefined;
    const color = (role && REFERENCE_STYLE.roleColors[role]) || REFERENCE_STYLE.defaultColor;
    const add = (coordinates: [number, number][], closed: boolean) => {
      if (coordinates?.length > 1) paths.push({ role, color, coordinates, closed });
    };
    // Points (e.g. text labels) aren't drawn.
    if (geometry?.type === 'LineString') {
      add(geometry.coordinates, false);
    } else if (geometry?.type === 'MultiLineString') {
      geometry.coordinates.forEach((line: any) => add(line, false));
    } else if (geometry?.type === 'Polygon') {
      geometry.coordinates.forEach((ring: any) => add(ring, true));
    } else if (geometry?.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon: any) => polygon.forEach((ring: any) => add(ring, true)));
    }
  }
  return paths;
}

/** The state of the reference drawing for the level being shown (see `Rapid3LevelTools.referenceDrawing`). */
export type ReferenceDrawingStatus = 'loading' | 'shown' | 'hidden' | 'failed';

/** The active level tools' far-end check, read by the wrapped OSM layer render. */
const farEndHook: { isFarEnd?: (entityId: string) => boolean } = {};

/**
 * Fades stops that are outside the current view (another level or station) but
 * still drawn as the far end of a connection that is in it. Rapid styles points
 * by their tags alone, so this wraps the OSM layer's render: after each frame,
 * matching point features get a lower container opacity, and points faded
 * before are restored. Installed once per page.
 */
export function installFarEndFading() {
  const proto = typeof Rapid === 'undefined' ? undefined : Rapid.PixiLayerOsm?.prototype;
  if (!proto?.render || proto.__gtfsFarEndFading) return;
  proto.__gtfsFarEndFading = true;

  const render = proto.render;
  const faded = new WeakSet<object>();
  proto.render = function (this: any, ...args: unknown[]) {
    const result = render.apply(this, args);
    const isFarEnd = farEndHook.isFarEnd;
    for (const feature of this.features?.values?.() ?? []) {
      if (feature.type !== 'Point' || !feature.container) continue;
      const id = feature.data?.id;
      if (isFarEnd && id && isFarEnd(id)) {
        feature.container.alpha = FAR_END_ALPHA;
        faded.add(feature);
      } else if (faded.has(feature)) {
        feature.container.alpha = 1;
        faded.delete(feature);
      }
    }
    return result;
  };
}

/** Every entity in a Rapid graph: loaded data plus local edits (minus local deletions). */
export function graphEntities(graph: any): any[] {
  const ids = new Set([...graph.base.entities.keys(), ...graph.local.entities.keys()]);
  const entities: any[] = [];
  for (const id of ids) {
    const entity = graph.hasEntity(id); // undefined if deleted locally
    if (entity) entities.push(entity);
  }
  return entities;
}

/** A defined value offered for a reference field (level_id, parent_station). */
export interface ReferenceChoice {
  value: string;
  /** Shown in the field once picked, e.g. "Concourse (L1)". */
  label: string;
  /** Shown beside the value in the dropdown, if not the label (e.g. the level's stations). */
  description?: string;
}

/** The fields whose choices are the workspace's defined levels / stations / platforms. */
export const REFERENCE_FIELDS = ['level_id', 'parent_station'] as const;

/** A stop as shown in the level panel. */
export interface LevelStop {
  id: string;
  label: string;
  levelId: string | undefined;
  /** The stop_ids of the stations it belongs to (none if no station). */
  stationIds?: string[];
}

/** A level outline flagged for being very large, or much bigger than its stops need. */
export interface LargeLevelArea extends LevelStop {
  /** How far across it is, in meters (its longer side). */
  meters: number;
  /** How far across a box around its level's stops would be, if it has any. */
  stopsMeters?: number;
  /** Much bigger than that box, so "Refit" would shrink it. */
  oversized?: boolean;
}

/** A stop flagged for being far from the rest of its level. */
export interface FarStop extends LevelStop {
  levelId: string;
  /** How far it is from the middle of its level's stops, in meters. */
  meters: number;
}

/** A pathway, with the stations (stop_ids) of its end stops. */
export interface LevelPathway {
  id: string;
  /** Its type and end stops, e.g. "Stairs: Mezzanine ↔ Platform C". */
  label: string;
  stationIds: string[];
}

/** A pathway's type and end stops: "↔" if it runs both ways, "→" if one way. */
function describePathway(way: any, from: any, to: any): string {
  const mode = gtfsValueLabel('pathway_mode', way.tags?.pathway_mode?.trim()) ?? 'Pathway';
  const name = (end: any) => end?.tags?.stop_name?.trim() || end?.tags?.stop_id?.trim() || end?.id || '?';
  const arrow = way.tags?.is_bidirectional?.trim() === '0' ? '→' : '↔';
  return `${mode}: ${name(from)} ${arrow} ${name(to)}`;
}

/** A feature with a fixme note: something a reviewer still has to check (e.g. left by pathways-converter). */
export interface FixmeNote {
  id: string;
  /** What the feature is, e.g. "Platform: A" or "Stairs: Mezzanine ↔ Platform A". */
  label: string;
  note: string;
  /** The stop_ids of the stations it belongs to (none if no station). */
  stationIds: string[];
}

/** A feature's fixme note, if it has one; the key in any case (OSM data also has FIXME). */
export function fixmeNote(tags: Record<string, string> | undefined): string | undefined {
  for (const [key, value] of Object.entries(tags ?? {})) {
    if (key.toLowerCase() === 'fixme' && value?.trim()) return value.trim();
  }
  return undefined;
}

export interface LevelStopGroup {
  level: Level | undefined;
  stops: LevelStop[];
}

const LOCATION_TYPE_NAMES: Record<string, string> = {
  '': 'Stop',
  '0': 'Platform',
  '1': 'Station',
  '2': 'Entrance',
  '3': 'Generic Node',
  '4': 'Boarding Area'
};

/** "Name (ID)", or just the ID when there's no separate name. */
function choice(value: string, name?: string): ReferenceChoice {
  return { value, label: name && name !== value ? `${name} (${value})` : value };
}

function byLabel(a: ReferenceChoice, b: ReferenceChoice): number {
  return a.label.localeCompare(b.label, undefined, { numeric: true });
}

/**
 * level_indexes for levels being given their first outline, following the
 * panel's order within each station: levels that already have an index keep
 * it, and the new ones (listed after them, in level_id order) take the next
 * numbers above the highest index among the levels of the same station(s), or
 * from 0 in a station with none yet. A level in no station counts the other
 * levels in no station. Dragging levels in the panel then sets the real order.
 */
export function stationLevelIndexes(entities: any[], levels: Level[], newLevelIds: string[]): Map<string, number> {
  const { stationsByLevel } = buildStationIndex(entities);
  const stationsOf = (levelId: string) => stationsByLevel.get(levelId) ?? new Set<string>();
  const sharesStation = (a: string, b: string) => {
    const [sa, sb] = [stationsOf(a), stationsOf(b)];
    return sa.size || sb.size ? [...sa].some(id => sb.has(id)) : true;
  };

  const indexes = new Map<string, number>();
  const known = new Map(levels.filter(level => level.index !== undefined).map(level => [level.levelId, level.index!]));
  const order = levelsLowestFirst(levels).map(level => level.levelId).filter(id => newLevelIds.includes(id));
  for (const levelId of [...order, ...newLevelIds.filter(id => !order.includes(id))]) {
    const peers = [...known, ...indexes].filter(([other]) => other !== levelId && sharesStation(levelId, other));
    indexes.set(levelId, peers.length ? Math.floor(Math.max(...peers.map(([, index]) => index))) + 1 : 0);
  }
  return indexes;
}

/** An outline's corner node IDs, without repeating the first at the end. */
function outlineRing(area: any): string[] {
  return area.nodes[0] === area.nodes.at(-1) ? area.nodes.slice(0, -1) : [...area.nodes];
}

/** Whether an outline is a plain four-corner box (as "Outline all" and "Refit" draw). */
function isBox(area: any): boolean {
  const ring = outlineRing(area);
  return ring.length === 4 && new Set(ring).size === 4 && area.nodes[0] === area.nodes.at(-1);
}

/**
 * The levels an edit moved stops on or off: for each changed stop, its
 * level_id before and after (if they differ), including stops added or deleted.
 * @param difference - Rapid's Difference for the edit (its `changes`)
 */
export function changedStopLevels(difference: any): Set<string> {
  const levelIds = new Set<string>();
  const isStop = (entity: any) => entity?.type === 'node' && Object.keys(entity.tags ?? {}).length > 0;
  for (const { base, head } of difference?.changes?.values?.() ?? []) {
    if (!isStop(base) && !isStop(head)) continue;
    const before = isStop(base) ? stopLevelIdOf(base) : undefined;
    const after = isStop(head) ? stopLevelIdOf(head) : undefined;
    if (before === after) continue;
    if (before) levelIds.add(before);
    if (after) levelIds.add(after);
  }
  return levelIds;
}

function stopLevelIdOf(entity: any): string | undefined {
  return entity.tags?.level_id?.trim() || undefined;
}

function describeStop(entity: any): LevelStop {
  const tags = entity.tags ?? {};
  const kind = LOCATION_TYPE_NAMES[tags.location_type?.trim() ?? ''] ?? 'Stop';
  const name = tags.stop_name?.trim() || tags.stop_id?.trim() || entity.id;
  return { id: entity.id, label: `${kind}: ${name}`, levelId: tags.level_id?.trim() || undefined };
}

/**
 * GTFS level tools for a Rapid 3 editor opened on a pathways workspace.
 *
 * Keeps reactive lists of the workspace's levels, its stops grouped by level,
 * and the stops missing a level, refreshed as data loads and edits are made.
 * Choosing a view (a level, features with no station, or a station's features
 * with no level) hides everything else on the map (see `isHiddenInView`).
 * Edits (drawing levels, setting level_ids) go through Rapid's editor, so they
 * can be undone and are uploaded like any other change.
 */
export class Rapid3LevelTools {
  /** Known levels, sorted by level_index. */
  readonly levels = shallowRef<Level[]>([]);
  /** Levels grouped by the stations whose stops use them (see `levelsByStation`). */
  readonly levelGroups = shallowRef<StationLevelGroup[]>([]);
  /** How many stops aren't in any station (what the "No station" view shows). */
  readonly noStationStopCount = ref(0);
  /**
   * Whether the whole workspace has loaded (set by Rapid3Manager). Until it has,
   * only the areas viewed so far are loaded, so stations outside them are
   * missing and their levels show under "No station".
   */
  readonly workspaceLoad = ref<'loading' | 'loaded' | 'failed' | undefined>();
  /** Loads the whole workspace again after it failed (set by Rapid3Manager). */
  retryWorkspaceLoad: (() => void) | undefined;
  /**
   * stop_ids of the stations with features in the map view (the station, its
   * stops, or its levels' outlines), or undefined when that isn't known yet.
   */
  readonly visibleStationIds = shallowRef<Set<string> | undefined>();
  /** Stops grouped by level in level order, unleveled stops last. */
  readonly stopGroups = shallowRef<LevelStopGroup[]>([]);
  /**
   * Pathways by the levels they touch (a level of either end stop; "" for an
   * end stop with no level), each with the stations (stop_ids) of its end stops.
   */
  readonly levelPathways = shallowRef<Map<string, LevelPathway[]>>(new Map());
  /** Stops that should be on a level but have no level_id. */
  readonly unleveled = shallowRef<LevelStop[]>([]);
  /** Level areas without a level_id (so stops can't reference them). */
  readonly levelAreasMissingId = shallowRef<LevelStop[]>([]);
  /** Level outlines so large they should be checked, largest first. */
  readonly largeLevelAreas = shallowRef<LargeLevelArea[]>([]);
  /** Stops far from the rest of their level, farthest first. */
  readonly farStops = shallowRef<FarStop[]>([]);
  /** Every feature with a fixme note, in label order. */
  readonly fixmes = shallowRef<FixmeNote[]>([]);
  /**
   * The reference drawing of the level being shown (from its outline's
   * `ext:reference_url`), drawn under the map data; undefined when the level
   * has none, or no level is shown.
   */
  readonly referenceDrawing = ref<{ levelId: string; status: ReferenceDrawingStatus; legend?: ReferenceLegendEntry[] } | undefined>();
  /** Whether reference drawings are shown (the panel's Hide/Show). */
  readonly showReferenceDrawings = ref(true);
  /** The level being shown, or undefined to show all levels. */
  /** What the map is filtered to, or undefined to show everything. */
  readonly view = ref<LevelView | undefined>();
  /** The level being shown, when the view is a level. */
  readonly currentLevelId = computed(() => (this.view.value?.kind === 'level' ? this.view.value.levelId : undefined));

  #context: any;
  #refreshTimer: ReturnType<typeof setTimeout> | undefined;
  #viewportTimer: ReturnType<typeof setTimeout> | undefined;
  #stationIndex: StationIndex = { stations: new Map(), stationOfStop: new Map(), stationsByLevel: new Map() };
  /** The area each station's point and stops cover, by stop_id. */
  #stationExtents = new Map<string, LonLatBox>();
  /** Stations to offer as a parent_station (incl. ones getting a suggested stop_id). */
  #stations: ReferenceChoice[] = [];
  /** Platforms to offer as a boarding area's parent_station (likewise). */
  #platforms: ReferenceChoice[] = [];
  #assigningStopIds = false;
  /** Set by 'historyjump' (undo, redo, restore) so `#onStableChange` skips it. */
  #historyJumped = false;
  #autoRefitting = false;
  /** Pixi objects drawing the highlighted stations' boxes and labels (see `#drawStationHighlight`). */
  #stationHighlight: { boxes: any; labels: any } | undefined;
  /** Fetches a reference URL's GeoJSON (with the user's TDEI sign-in). */
  #fetchReference: ((url: string) => Promise<unknown>) | undefined;
  #referenceCache = new Map<string, Promise<unknown>>();
  #referenceGraphics: any;
  /** What's drawn (the URLs, or "" for nothing), so an unchanged drawing isn't redrawn. */
  #referenceDrawn = '';
  /** Counts reference updates, so a load that finishes after a newer update is ignored. */
  #referenceUpdate = 0;

  /**
   * @param fetchReference - fetches a level's reference data (`ext:reference_url`);
   *   without it, reference drawings aren't shown
   */
  constructor(context: any, { fetchReference }: { fetchReference?: (url: string) => Promise<unknown> } = {}) {
    this.#context = context;
    this.#fetchReference = fetchReference;
    this.#installLevelFilter();
    farEndHook.isFarEnd = id => this.#isFarEnd(id);
    installFarEndFading();

    // Data arrives in many small merges while loading; batch the refreshes.
    const editor = context.systems.editor;
    const scheduleRefresh = () => {
      clearTimeout(this.#refreshTimer);
      this.#refreshTimer = setTimeout(() => this.refresh(), 100);
    };
    for (const event of ['merge', 'stablechange', 'historyjump']) {
      editor.on(event, scheduleRefresh);
    }
    // Right after an edit (not batched): write any suggested stop_id it used.
    editor.on('stablechange', () => this.#assignReferencedStopIds());
    // Keep simple level outlines fitted to their stops as stops change level.
    editor.on('stablechange', (difference: any) => this.#onStableChange(difference));
    editor.on('historyjump', () => {
      this.#historyJumped = true;
    });

    // A station selected in the editor gets highlighted too.
    context.on?.('modechange', () => this.#drawStationHighlight());

    // Track which stations are in view as the map moves. Rapid 3 signals pans
    // and zooms only through the renderer's 'draw' (the map's 'mapchange' is
    // just for display options like the area fill mode).
    context.systems.gfx?.on?.('draw', () => {
      clearTimeout(this.#viewportTimer);
      this.#viewportTimer = setTimeout(() => this.updateVisibleStations(), 150);
    });

    this.refresh();
  }

  /** Recomputes the level, stop and unleveled lists from the current edit. */
  refresh() {
    const entities = this.#entities();
    const levels = collectLevels(entities);

    this.#stationIndex = buildStationIndex(entities);
    this.#stationExtents = stationExtents(entities, this.#stationIndex);
    this.levels.value = levels;
    this.levelGroups.value = levelsByStation(entities, this.#stationIndex);
    const { stations, stationOfStop } = this.#stationIndex;
    this.noStationStopCount.value = stopNodes(entities)
      .filter(stop => !stations.has(stop.id) && !stationOfStop.has(stop.id)).length;
    const stationIdsOf = (id: string | number): string[] => {
      const stationId = stations.get(id)?.stopId ?? stationOfStop.get(id);
      return stationId ? [stationId] : [];
    };
    const byId = new Map(entities.map(entity => [entity.id, entity]));
    const levelPathways = new Map<string, LevelPathway[]>();
    for (const way of entities.filter(isPathway)) {
      const ends = [way.nodes[0], way.nodes.at(-1)].map(id => byId.get(id)).filter(Boolean);
      const pathway = {
        id: String(way.id),
        label: describePathway(way, ends[0], ends[1]),
        stationIds: [...new Set(ends.flatMap(end => stationIdsOf(end.id)))]
      };
      const stops = ends.filter(end => Object.keys(end.tags ?? {}).length);
      // With no stops at its ends, it's on no level either.
      for (const levelId of new Set(stops.length ? stops.map(end => stopLevelId(end) ?? '') : [''])) {
        levelPathways.set(levelId, [...(levelPathways.get(levelId) ?? []), pathway]);
      }
    }
    this.levelPathways.value = levelPathways;
    this.fixmes.value = entities.flatMap((entity): FixmeNote[] => {
      const note = fixmeNote(entity.tags);
      if (!note) return [];
      const tags = entity.tags ?? {};
      if (isPathway(entity)) {
        const [from, to] = [entity.nodes[0], entity.nodes.at(-1)].map(id => byId.get(id));
        const stationIds = [...new Set([from, to].filter(Boolean).flatMap(end => stationIdsOf(end.id)))];
        return [{ id: String(entity.id), label: describePathway(entity, from, to), note, stationIds }];
      }
      if (isLevelArea(entity)) {
        const levelId = tags.level_id?.trim();
        const name = tags.level_name?.trim();
        const stationIds = [...(levelId ? this.#stationIndex.stationsByLevel.get(levelId) ?? [] : [])];
        return [{ id: String(entity.id), label: `Level: ${name && levelId ? `${name} (${levelId})` : name || levelId || entity.id}`, note, stationIds }];
      }
      const label = entity.type === 'node' ? describeStop(entity).label : `Feature ${entity.id}`;
      return [{ id: String(entity.id), label, note, stationIds: stationIdsOf(entity.id) }];
    }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    this.stopGroups.value = stopsByLevel(entities)
      .map(({ level, stops }) => ({ level, stops: stops.map(stop => ({ ...describeStop(stop), stationIds: stationIdsOf(stop.id) })) }));
    this.unleveled.value = unleveledStops(entities)
      .map(stop => ({ ...describeStop(stop), stationIds: stationIdsOf(stop.id) }));
    this.levelAreasMissingId.value = levelAreasMissingId(entities)
      .map(area => ({ id: area.id, label: area.tags?.level_name?.trim() || area.id, levelId: undefined, stationIds: [] }));
    const graph = this.#graph();
    this.largeLevelAreas.value = largeLevelAreas(entities, id => graph.hasEntity(id)?.loc)
      .map(({ area, meters, stopsMeters, oversized }) => {
        const levelId = area.tags?.level_id?.trim() || undefined;
        const name = area.tags?.level_name?.trim();
        const label = name && levelId ? `${name} (${levelId})` : name || levelId || String(area.id);
        const stationIds = [...(levelId ? this.#stationIndex.stationsByLevel.get(levelId) ?? [] : [])];
        return { id: area.id, label, levelId, meters, stopsMeters, oversized, stationIds };
      });
    this.farStops.value = farStops(entities)
      .map(({ stop, levelId, meters }) => ({ ...describeStop(stop), levelId, meters, stationIds: stationIdsOf(stop.id) }));
    // Stations and platforms that may be a parent_station. Those without a
    // stop_id are offered under a suggested one, written once it's used.
    const suggested = suggestedStopIds(entities);
    const parentChoice = (stop: any): ReferenceChoice => {
      const stopId = stop.tags?.stop_id?.trim();
      if (stopId) return choice(stopId, stop.tags?.stop_name?.trim());
      const name = stop.tags?.stop_name?.trim() || `Unnamed ${stop.tags?.location_type?.trim() === '1' ? 'station' : 'platform'}`;
      return { value: suggested.get(stop.id)!, label: `${name} (new stop_id ${suggested.get(stop.id)})` };
    };
    const candidates = stopNodes(entities).filter(stop => stop.tags?.stop_id?.trim() || suggested.has(stop.id));
    this.#stations = candidates
      .filter(stop => stop.tags?.location_type?.trim() === '1')
      .map(parentChoice)
      .sort(byLabel);
    this.#platforms = candidates
      .filter(stop => ['', '0'].includes(stop.tags?.location_type?.trim() ?? ''))
      .map(parentChoice)
      .sort(byLabel);
    this.#labelReferenceChoices();
    this.updateVisibleStations();

    // Drop a view whose level or station no longer exists.
    const view = this.view.value;
    const stale = (view?.kind === 'level' && !levels.some(level => level.levelId === view.levelId))
      || (view?.kind === 'noStation' && !this.noStationStopCount.value
        && !this.levelGroups.value[0]?.levels.length)
      || (view?.kind === 'stationNoLevel'
        && ![...this.#stationIndex.stations.values()].some(station => station.stopId === view.stationId));
    if (stale) {
      this.showView(undefined);
    } else if (view) {
      this.#redraw(); // station membership may have changed
    } else {
      this.#drawStationHighlight(); // a selected station may have moved
    }
  }

  /**
   * The defined values a reference field can take: drawn levels for level_id
   * (lowest first); stations for parent_station, or platforms when the
   * feature is a boarding area. Undefined for other keys.
   * @param entityId - the feature being edited, if known
   */
  referenceChoices(key: string, entityId?: string): ReferenceChoice[] | undefined {
    if (key === 'level_id') {
      const { stations, stationsByLevel } = this.#stationIndex;
      const names = new Map([...stations.values()].map(station => [station.stopId, station.name]));
      return levelsLowestFirst(this.levels.value.filter(level => level.areaIds.length))
        .map((level) => {
          // Describe a level by its name and the stations whose stops use it.
          const stationNames = [...stationsByLevel.get(level.levelId) ?? []]
            .map(id => names.get(id) ?? id)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          const name = level.name && level.name !== level.levelId ? level.name : undefined;
          const description = [name, stationNames.length ? stationNames.join(', ') : 'No station']
            .filter(Boolean).join(' · ');
          return { ...choice(level.levelId, level.name), description };
        });
    }
    if (key === 'parent_station') {
      const entity = entityId ? this.#graph().hasEntity(entityId) : undefined;
      return entity?.tags?.location_type?.trim() === '4' ? this.#platforms : this.#stations;
    }
    return undefined;
  }

  /**
   * After an edit, gives a station or platform the suggested stop_id that a
   * stop now names as its parent_station (picked from the field's choices),
   * folded into that same edit so one undo reverts both.
   */
  #assignReferencedStopIds() {
    if (this.#assigningStopIds) return;
    const editor = this.#context.systems.editor;
    const entities = this.#entities();
    const suggested = suggestedStopIds(entities);
    if (!suggested.size) return;

    const referenced = new Set(entities.map(entity => entity.tags?.parent_station?.trim()).filter(Boolean));
    const graph = this.#graph();
    const actions = [...suggested]
      .filter(([, stopId]) => referenced.has(stopId))
      .map(([id, stopId]) => {
        const stop = graph.hasEntity(id);
        return Rapid.actionChangeTags(id, { ...stop.tags, stop_id: stopId });
      });
    if (!actions.length) return;

    this.#assigningStopIds = true;
    try {
      editor.perform(...actions);
      editor.commitAppend({
        annotation: editor.getUndoAnnotation?.() ?? 'Set stop_id',
        selectedIDs: this.#context.selectedIDs?.() ?? []
      });
    } finally {
      this.#assigningStopIds = false;
    }
  }

  /**
   * Gives Rapid display labels for the reference fields' choices, so a field
   * shows "Concourse (L1)" for level_id L1. Rapid's combo fields read option
   * labels from its tagging strings; these are set for the current locale and
   * English (the fallback), and kept current as levels and stations change.
   */
  #labelReferenceChoices() {
    const l10n = this.#context.systems.l10n;
    if (!l10n?._store) return;

    const choices: Record<string, ReferenceChoice[]> = {
      level_id: this.referenceChoices('level_id')!,
      parent_station: [...this.#stations, ...this.#platforms]
    };
    for (const code of new Set(['en', l10n.localeCode].filter(Boolean))) {
      for (const [field, list] of Object.entries(choices)) {
        for (const { value, label } of list) {
          // Array path: dots or digits in an ID must not split the path.
          l10n._store.set([code, 'tagging', 'presets', 'fields', field, 'options', value], label);
        }
      }
    }
  }

  /**
   * Recomputes which stations are in the map view: those whose station point
   * and stops span an area that overlaps it (so a station stays listed while
   * zoomed in between its stops).
   */
  updateVisibleStations() {
    const view = this.#context.systems.map?.extent?.();
    if (!view?.min || !view?.max) return; // can't tell: list every station

    const ids = new Set<string>();
    for (const [stopId, box] of this.#stationExtents) {
      if (boxesOverlap(box, view)) ids.add(stopId);
    }
    // 'draw' fires every frame, so only notify the panel when the list changes.
    const current = this.visibleStationIds.value;
    if (current?.size === ids.size && [...ids].every(id => current.has(id))) return;
    this.visibleStationIds.value = ids;
  }

  /** Shows only features on the given level (and unleveled stops), or every level. */
  showLevel(levelId: string | undefined) {
    this.showView(levelId ? { kind: 'level', levelId } : undefined);
  }

  /** Filters the map to a view, or shows everything when undefined. */
  showView(view: LevelView | undefined) {
    this.view.value = view;
    this.#redraw();
  }

  #redraw() {
    const { filters, gfx } = this.#context.systems;
    filters.emit('filterchange'); // makes the map redraw its OSM layer
    this.#drawStationHighlight();
    void this.updateReferenceDrawing();
    gfx?.immediateRedraw();
  }

  /** Shows or hides reference drawings. */
  toggleReferenceDrawings() {
    this.showReferenceDrawings.value = !this.showReferenceDrawings.value;
    void this.updateReferenceDrawing();
  }

  /**
   * Draws the reference drawing of the level being shown, loading it first if
   * needed, or clears it when there's none to show. A drawing that failed to
   * load is tried again on the next update (e.g. "Retry").
   */
  async updateReferenceDrawing() {
    const update = ++this.#referenceUpdate;
    const levelId = this.currentLevelId.value;
    const urls = levelId && this.#fetchReference ? referenceUrls(this.#entities(), levelId) : [];

    if (!levelId || !urls.length) {
      this.referenceDrawing.value = undefined;
      this.#drawReference([], '');
      return;
    }
    if (!this.showReferenceDrawings.value) {
      this.referenceDrawing.value = { levelId, status: 'hidden' };
      this.#drawReference([], '');
      return;
    }

    const key = urls.join('\n');
    if (key === this.#referenceDrawn && this.referenceDrawing.value?.status === 'shown') return; // already drawn
    this.referenceDrawing.value = { levelId, status: 'loading' };
    try {
      const drawings = await Promise.all(urls.map(url => this.#loadReference(url)));
      if (update !== this.#referenceUpdate) return; // the view changed meanwhile
      const paths = drawings.flatMap(referencePaths);
      this.#drawReference(paths, key);
      this.referenceDrawing.value = { levelId, status: 'shown', legend: referenceLegend(paths) };
    }
    catch (error) {
      if (update !== this.#referenceUpdate) return;
      console.warn(`Couldn't load the reference drawing for level ${levelId}`, error);
      this.#drawReference([], '');
      this.referenceDrawing.value = { levelId, status: 'failed' };
    }
  }

  #loadReference(url: string): Promise<unknown> {
    let load = this.#referenceCache.get(url);
    if (!load) {
      load = this.#fetchReference!(url);
      this.#referenceCache.set(url, load);
      load.catch(() => this.#referenceCache.delete(url)); // try again next time
    }
    return load;
  }

  /**
   * Draws reference lines in Rapid's "debug-under" group (above the imagery,
   * below the editable data), over the station highlight's shading. Lines are
   * 1px at any zoom (Pixi's `pixelLine`), so they're built once rather than
   * again as the map zooms. Coordinates are relative to the first point, so a
   * detailed drawing stays precise when zoomed in.
   */
  #drawReference(paths: ReturnType<typeof referencePaths>, key: string) {
    this.#referenceDrawn = key;
    if (!paths.length && !this.#referenceGraphics) return; // nothing drawn, nothing to clear
    const PIXI = (globalThis as any).PIXI;
    const project = (globalThis as any).Rapid?.sdk?.projWgs84ToWorld;
    const gfx = this.#context.systems.gfx;
    const group = gfx?.scene?.groups?.get('debug-under');
    if (!PIXI?.Graphics || !project || !group) return;

    if (!this.#referenceGraphics) {
      this.#referenceGraphics = new PIXI.Graphics();
      this.#referenceGraphics.label = 'gtfs-reference-drawing';
      this.#referenceGraphics.eventMode = 'none';
    }
    const graphics = this.#referenceGraphics;
    if (graphics.parent !== group) {
      // Over the station highlight's shading, if it's drawn (see `#drawStationHighlight`).
      const boxes = this.#stationHighlight?.boxes;
      group.addChildAt(graphics, boxes?.parent === group ? group.getChildIndex(boxes) + 1 : 0);
    }
    graphics.clear();

    if (paths.length) {
      const [originX, originY] = project(paths[0]!.coordinates[0]!);
      graphics.position.set(originX, originY);
      for (const { color, coordinates, closed } of paths) {
        coordinates.forEach((coordinate, i) => {
          const [x, y] = project(coordinate);
          if (i === 0) graphics.moveTo(x - originX, y - originY);
          else graphics.lineTo(x - originX, y - originY);
        });
        if (closed) graphics.closePath();
        graphics.stroke({ width: 1, color, alpha: REFERENCE_STYLE.alpha, pixelLine: true });
      }
    }
    gfx.deferredRedraw?.();
  }

  /**
   * Draws a translucent black box behind each highlighted station (see
   * `highlightedStationIds`), around its station point and stops, so what
   * belongs to it stands out from the map. It's drawn in Rapid's "debug-under"
   * group, between the background imagery and the editable data, in world
   * coordinates, so it pans and zooms with the map. Needs the Pixi global
   * that Rapid's dev build (the one we load) exposes.
   */
  #drawStationHighlight() {
    const PIXI = (globalThis as any).PIXI;
    const project = (globalThis as any).Rapid?.sdk?.projWgs84ToWorld;
    const gfx = this.#context.systems.gfx;
    const group = gfx?.scene?.groups?.get('debug-under');
    if (!PIXI?.Graphics || !project || !group) return;

    if (!this.#stationHighlight) {
      const boxes = new PIXI.Graphics();
      boxes.label = 'gtfs-station-highlight';
      boxes.eventMode = 'none';
      const labels = new PIXI.Container();
      labels.label = 'gtfs-station-highlight-labels';
      labels.eventMode = 'none';
      this.#stationHighlight = { boxes, labels };
    }
    const { boxes, labels } = this.#stationHighlight;
    // The shading goes under everything else in the group (e.g. a level's reference
    // drawing); its labels go on top, so they stay readable.
    if (boxes.parent !== group) group.addChildAt(boxes, 0);
    if (labels.parent !== group) group.addChild(labels);
    boxes.clear();
    for (const old of labels.removeChildren()) old.destroy();

    const selectedIds = this.#context.selectedIDs?.() ?? [];
    const names = new Map([...this.#stationIndex.stations.values()].map(station => [station.stopId, station.name]));
    for (const stationId of highlightedStationIds(this.view.value, selectedIds, this.#stationIndex)) {
      const box = this.#stationExtents.get(stationId);
      if (!box) continue;
      const corners = levelBoxCorners([box.min, box.max], STATION_HIGHLIGHT.paddingMeters);
      const [x0, y0] = project(corners[3]); // northwest
      const [x1, y1] = project(corners[1]); // southeast
      const [left, top] = [Math.min(x0, x1), Math.min(y0, y1)];
      boxes
        .rect(left, top, Math.abs(x1 - x0), Math.abs(y1 - y0))
        .fill({ color: STATION_HIGHLIGHT.color, alpha: STATION_HIGHLIGHT.alpha });

      // The group is in world coordinates, which Rapid scales as the map zooms;
      // undo that scale each frame so the label stays the same size on screen.
      const text = new PIXI.Text({
        text: STATION_HIGHLIGHT.label(names.get(stationId) ?? stationId),
        style: STATION_HIGHLIGHT.labelStyle
      });
      text.eventMode = 'none';
      text.onRender = () => {
        const scale = gfx.origin?.scale?.x || 1;
        const inset = STATION_HIGHLIGHT.labelInsetPx / scale;
        text.scale.set(1 / scale);
        text.position.set(left + inset, top + inset);
      };
      text.onRender();
      labels.addChild(text);
    }
    gfx.deferredRedraw?.();
  }

  /** Pans and zooms the map to a level's area, or to its stops if it has no area. */
  /**
   * Pans and zooms the map to a station: its station point and stops, or with
   * `noLevel`, just those its "No level" view shows (the station point
   * and its stops without a level_id).
   */
  zoomToStation(stationId: string, { noLevel = false }: { noLevel?: boolean } = {}) {
    const { stations, stationOfStop } = this.#stationIndex;
    const entities = this.#entities().filter((entity) => {
      if (stations.get(entity.id)?.stopId === stationId) return true;
      if (stationOfStop.get(entity.id) !== stationId) return false;
      return !noLevel || !entity.tags?.level_id?.trim();
    });
    if (entities.length) {
      this.#context.systems.map.fitEntitiesEase(entities);
    }
  }

  zoomToLevel(levelId: string) {
    const graph = this.#graph();
    const level = this.levels.value.find(l => l.levelId === levelId);
    let entities = (level?.areaIds ?? []).map(id => graph.hasEntity(id)).filter(Boolean);
    if (!entities.length) {
      entities = this.stopGroups.value
        .find(group => group.level?.levelId === levelId)?.stops
        .map(stop => graph.hasEntity(stop.id)).filter(Boolean) ?? [];
    }
    if (entities.length) {
      this.#context.systems.map.fitEntitiesEase(entities);
    }
  }

  /**
   * Starts drawing a level outline: Rapid's area drawing mode, with the new area
   * pre-tagged as a level. Pass an existing level (e.g. one only stops use so
   * far) to outline it; otherwise it's a new level one index above the highest,
   * with a generated level_id. Once finished, Rapid selects the new area so its
   * tags (e.g. level_name) can be edited.
   */
  drawLevel(level?: Level) {
    const index = level?.index ?? nextLevelIndex(this.levels.value);
    const levelId = level?.levelId
      ?? suggestLevelId(index, this.levels.value.map(l => l.levelId), this.#viewStationIds());

    // Show the level being outlined (or everything, for a brand-new level) so
    // the new area isn't hidden by the level filter once it's drawn.
    this.showLevel(level?.levelId);

    // DrawAreaMode resets its defaultTags on enter, so set them on the entered mode.
    const mode = this.#context.enter('draw-area');
    if (mode) {
      mode.defaultTags = { area: 'yes', level_id: levelId, level_index: String(index) };
    }
  }

  /**
   * Reshapes a level's outline into a box around its stops again (padded like
   * a new outline), e.g. after fixing a stray stop that had stretched it. A
   * four-corner outline keeps its corners, moved into place; any other shape
   * gets four new corners, and old corners nothing else uses are deleted. One
   * undoable edit. Returns false (and changes nothing) if the outline has no
   * level_id or the level has no located stops.
   */
  refitLevelArea(areaId: string): boolean {
    const plan = this.#refitPlan(areaId);
    if (!plan) return false;

    const editor = this.#context.systems.editor;
    editor.perform(...this.#refitActions(plan));
    editor.commit({ annotation: `Refit level ${plan.levelId}'s outline to its stops`, selectedIDs: [areaId] });
    this.refresh();
    return true;
  }

  /** The actions that reshape an outline into its refit box (see `refitLevelArea`). */
  #refitActions({ area, corners }: { area: any; corners: [number, number][] }): unknown[] {
    const ring = outlineRing(area);
    const actions: unknown[] = [];
    // A corner that's also a stop or part of another way must not move with the outline.
    const graph = this.#graph();
    const ownCorner = (nodeId: string) => {
      const node = graph.hasEntity(nodeId);
      return node && !Object.keys(node.tags ?? {}).length
        && graph.parentWays(node).every((way: any) => way.id === area.id);
    };
    if (ring.length === 4 && new Set(ring).size === 4 && ring.every(ownCorner)) {
      // Walking the ring onto the corners in order keeps it a simple box.
      ring.forEach((nodeId, i) => actions.push(Rapid.actionMoveNode(nodeId, corners[i])));
    } else {
      const nodes = corners.map(loc => new Rapid.OsmNode(this.#context, { loc }));
      actions.push(
        ...nodes.map(node => Rapid.actionAddEntity(node)),
        Rapid.actionAddEntity(area.update({ nodes: [...nodes.map(node => node.id), nodes[0].id] }))
      );
      // Then drop old corners left unused (shared or tagged ones stay).
      const unused = (nodeId: string) => (g: any) => {
        const node = g.hasEntity(nodeId);
        if (!node || Object.keys(node.tags ?? {}).length || g.parentWays(node).length) return g;
        return Rapid.actionDeleteNode(nodeId, false)(g);
      };
      actions.push(...[...new Set(ring)].map(unused));
    }
    return actions;
  }

  /**
   * After an edit changes which level stops are on (a stop's level_id, or a
   * stop on a level added or deleted), fits the outlines of the levels it
   * touched, old and new, to their stops: folded into that same edit, so one
   * undo reverts both. A level with no outline gets one. Only a level's sole
   * outline is refit, and only if it's a plain four-corner box, so hand-shaped
   * outlines are kept (they can still be refit with "Refit"). Undo, redo and
   * restores don't trigger it: they emit 'historyjump' right after
   * 'stablechange', so this waits a microtask and skips if one came.
   */
  #onStableChange(difference: any) {
    this.#historyJumped = false;
    if (this.#autoRefitting) return;
    const levelIds = changedStopLevels(difference);
    if (!levelIds.size) return;
    queueMicrotask(() => {
      if (!this.#historyJumped) this.#autoRefit(levelIds);
    });
  }

  #autoRefit(levelIds: Set<string>) {
    const graph = this.#graph();
    const areasByLevel = new Map<string, any[]>();
    for (const area of this.#entities().filter(isLevelArea)) {
      const levelId = area.tags?.level_id?.trim();
      if (levelIds.has(levelId)) areasByLevel.set(levelId, [...(areasByLevel.get(levelId) ?? []), area]);
    }

    const actions: unknown[] = [];
    for (const areas of areasByLevel.values()) {
      if (areas.length !== 1 || !isBox(areas[0])) continue;
      const plan = this.#refitPlan(areas[0].id);
      if (!plan) continue; // no stops left on it: leave it be
      const ring = outlineRing(plan.area);
      const unchanged = ring.every((nodeId, i) => {
        const loc = graph.hasEntity(nodeId)?.loc;
        return loc && Math.abs(loc[0] - plan.corners[i]![0]) < 1e-9 && Math.abs(loc[1] - plan.corners[i]![1]) < 1e-9;
      });
      if (!unchanged) actions.push(...this.#refitActions(plan));
    }
    actions.push(...this.#outlineActions([...levelIds]).actions); // levels with no outline yet
    if (!actions.length) return;

    const editor = this.#context.systems.editor;
    this.#autoRefitting = true;
    try {
      editor.perform(...actions);
      editor.commitAppend({
        annotation: editor.getUndoAnnotation?.() ?? 'Refit level outlines',
        selectedIDs: this.#context.selectedIDs?.() ?? []
      });
    } finally {
      this.#autoRefitting = false;
    }
    this.refresh();
  }

  /** The outline, its level_id and the box to refit it to, or undefined if it can't be refit. */
  #refitPlan(areaId: string): { area: any; levelId: string; corners: [number, number][] } | undefined {
    const area = this.#graph().hasEntity(areaId);
    const levelId = area?.tags?.level_id?.trim();
    if (!area || !isLevelArea(area) || !levelId) return undefined;

    const locs = stopNodes(this.#entities())
      .filter(stop => stop.tags?.level_id?.trim() === levelId && stop.loc)
      .map(stop => stop.loc as [number, number]);
    const corners = levelBoxCorners(locs);
    return corners.length ? { area, levelId, corners } : undefined;
  }

  /**
   * Outlines levels that stops use but that have no outline yet, each with a
   * box around its stops (padded, so a single stop gets a square), as one
   * undoable edit. They're stacked above the highest level (level_index);
   * drag them into order afterwards. With one level, the new outline is
   * selected for reshaping.
   * @returns the new outlines' way IDs
   */
  outlineLevels(levelIds: string[]): string[] {
    const { actions, wayIds, outlined: toOutline } = this.#outlineActions(levelIds);
    if (!toOutline.length) return [];

    const editor = this.#context.systems.editor;
    editor.perform(...actions);
    editor.commit({
      annotation: toOutline.length === 1 ? `Outlined level ${toOutline[0]}` : `Outlined ${toOutline.length} levels`,
      selectedIDs: wayIds
    });
    this.refresh();
    if (wayIds.length === 1) {
      this.#context.enter('select-osm', { selection: { osm: wayIds } });
    }
    return wayIds;
  }

  /**
   * Outlines every level that stops use but that has no outline yet, as one
   * undoable edit (like "Outline all"). Returns how many levels it outlined.
   */
  outlineMissingLevels(): number {
    const missing = collectLevels(this.#entities()).filter(level => !level.areaIds.length).map(level => level.levelId);
    const { actions, outlined } = this.#outlineActions(missing);
    if (!outlined.length) return 0;

    const editor = this.#context.systems.editor;
    editor.perform(...actions);
    editor.commit({
      annotation: outlined.length === 1 ? `Outlined level ${outlined[0]}` : `Outlined ${outlined.length} levels`,
      selectedIDs: this.#context.selectedIDs?.() ?? []
    });
    this.refresh();
    return outlined.length;
  }

  /**
   * The actions that add a box outline around each given level's stops, for
   * those that have located stops and no outline yet, stacked above the
   * highest level. Read from the current edit, not the (batched) lists.
   */
  #outlineActions(levelIds: string[]): { actions: unknown[]; wayIds: string[]; outlined: string[] } {
    const entities = this.#entities();
    const byLevel = new Map<string, [number, number][]>();
    for (const stop of stopNodes(entities)) {
      const levelId = stop.tags?.level_id?.trim();
      if (levelId && stop.loc) byLevel.set(levelId, [...(byLevel.get(levelId) ?? []), stop.loc]);
    }

    const levels = collectLevels(entities);
    const known = new Map(levels.map(level => [level.levelId, level]));
    const outlined = [...new Set(levelIds)].filter(id => known.has(id) && !known.get(id)!.areaIds.length && byLevel.has(id));

    // Each new outline's level_index follows the panel's order within its
    // station(s): above the highest level there, in the order the panel lists
    // levels that have no index yet (see `stationLevelIndexes`).
    const indexes = stationLevelIndexes(entities, levels, outlined);
    const actions: unknown[] = [];
    const wayIds: string[] = [];
    for (const levelId of outlined) {
      const tags: Record<string, string> = { area: 'yes', level_id: levelId, level_index: String(indexes.get(levelId)) };
      const corners = levelBoxCorners(byLevel.get(levelId)!)
        .map(loc => new Rapid.OsmNode(this.#context, { loc }));
      const way = new Rapid.OsmWay(this.#context, {
        nodes: [...corners.map(node => node.id), corners[0].id],
        tags
      });
      actions.push(...corners.map(node => Rapid.actionAddEntity(node)), Rapid.actionAddEntity(way));
      wayIds.push(way.id);
    }
    return { actions, wayIds, outlined };
  }

  /** The stations (by stop_id) of the current view: a station's view, or a level's stations. */
  #viewStationIds(): string[] {
    const view = this.view.value;
    if (view?.kind === 'stationNoLevel') return [view.stationId];
    if (view?.kind === 'level') return [...this.#stationIndex.stationsByLevel.get(view.levelId) ?? []];
    return [];
  }

  /** The stations (by stop_id) with a station point or stop inside an outline's bounding box. */
  #stationsInside(area: any): string[] {
    const graph = this.#graph();
    const corners = (area.nodes ?? []).map((id: string) => graph.hasEntity(id)?.loc).filter(Boolean) as [number, number][];
    if (!corners.length) return [];
    const box = {
      min: [Math.min(...corners.map(c => c[0])), Math.min(...corners.map(c => c[1]))] as [number, number],
      max: [Math.max(...corners.map(c => c[0])), Math.max(...corners.map(c => c[1]))] as [number, number]
    };
    const { stations, stationOfStop } = this.#stationIndex;
    const ids = new Set<string>();
    for (const entity of this.#entities()) {
      const stationId = stations.get(entity.id)?.stopId ?? stationOfStop.get(entity.id);
      if (stationId && entity.loc && boxesOverlap(box, { min: entity.loc, max: entity.loc })) ids.add(stationId);
    }
    return [...ids];
  }

  /**
   * Gives a level area that has no level_id a generated one, based on its
   * level_index and the stations with stops inside it (see `suggestLevelId`),
   * so stops can reference it.
   * @returns the new level_id
   */
  fillLevelId(areaId: string): string | undefined {
    const area = this.#graph().hasEntity(areaId);
    if (!area || area.tags?.level_id?.trim()) return undefined;

    const index = levelAreaIndex(area) ?? nextLevelIndex(this.levels.value);
    const levelId = suggestLevelId(index, this.levels.value.map(level => level.levelId), this.#stationsInside(area));

    const editor = this.#context.systems.editor;
    editor.perform(Rapid.actionChangeTags(areaId, { ...area.tags, level_id: levelId }));
    editor.commit({ annotation: `Set level_id ${levelId}`, selectedIDs: [areaId] });
    return levelId;
  }

  /**
   * Renumbers level_index after the user reorders levels (as the panel lists
   * them, lowest first) — see `reorderedLevelIndexes`. Only levels with an outline
   * can be reordered, since that's where level_index is stored. Every outline of
   * each level whose index changes is updated, as one undoable edit.
   */
  reorderLevels(levelIdsLowestFirst: string[]) {
    const order = this.#outlinedLevels(levelIdsLowestFirst);
    this.#setLevelIndexes(order, reorderedLevelIndexes(order), 'Reordered levels');
  }

  /**
   * Renumbers a station's levels one apart in the given order (lowest first, as
   * the panel lists them), e.g. when two share a number or they were numbered
   * across the whole feed — see `renumberedLevelIndexes`. Every outline of each
   * level whose index changes is updated, as one edit.
   */
  renumberLevels(levelIdsLowestFirst: string[]) {
    const order = this.#outlinedLevels(levelIdsLowestFirst);
    this.#setLevelIndexes(order, renumberedLevelIndexes(order), 'Renumbered levels');
  }

  /** The given levels that have an outline (where level_index is stored), in order. */
  #outlinedLevels(levelIds: string[]): Level[] {
    const byId = new Map(this.levels.value.map(level => [level.levelId, level]));
    return levelIds.map(id => byId.get(id)).filter((level): level is Level => Boolean(level?.areaIds.length));
  }

  #setLevelIndexes(order: Level[], indexes: Map<string, number>, annotation: string) {
    const graph = this.#graph();
    const actions = order
      .filter(level => indexes.get(level.levelId) !== level.index)
      .flatMap(level => level.areaIds.map((areaId) => {
        const area = graph.hasEntity(areaId);
        return area && Rapid.actionChangeTags(areaId, { ...area.tags, level_index: String(indexes.get(level.levelId)) });
      }))
      .filter(Boolean);
    if (!actions.length) return;

    const editor = this.#context.systems.editor;
    editor.perform(...actions);
    editor.commit({ annotation, selectedIDs: [] });
    this.refresh(); // show the new order now, not after the batched refresh
  }

  /**
   * Selects a level's outline(s) in the editor, opening it in the sidebar,
   * without moving the map. With no level, deselects level outlines if they're
   * what's selected (e.g. when the level stops being shown).
   */
  selectLevelOutline(levelId?: string) {
    if (levelId) {
      const level = this.levels.value.find(l => l.levelId === levelId);
      if (level?.areaIds.length) {
        this.#context.enter('select-osm', { selection: { osm: level.areaIds.map(String) } });
      }
      return;
    }

    const outlineIds = new Set(this.levels.value.flatMap(level => level.areaIds.map(String)));
    const selected: string[] = this.#context.selectedIDs?.() ?? [];
    if (selected.length && selected.every(id => outlineIds.has(id))) {
      this.#context.enter('browse');
    }
  }

  /**
   * Highlights features on the map (or stops highlighting them), as Rapid
   * does when hovering an issue.
   */
  highlight(entityIds: string[], highlighted: boolean) {
    if (!entityIds.length) return;
    Rapid.utilHighlightEntities?.(this.#context, entityIds, highlighted);
  }

  /** Selects a feature in the editor and brings it into view. */
  select(entityId: string) {
    const entity = this.#graph().hasEntity(entityId);
    if (!entity) return;

    this.#context.systems.map.fitEntitiesEase([entity]);
    this.#context.enter('select-osm', { selection: { osm: [entityId] } });
  }

  /** Sets level_id on the given stops, as one undoable edit. */
  assignLevel(stopIds: string[], levelId: string) {
    const graph = this.#graph();
    const actions = stopIds
      .map(id => graph.hasEntity(id))
      .filter(Boolean)
      .map((entity: any) => Rapid.actionChangeTags(entity.id, { ...entity.tags, level_id: levelId }));
    if (!actions.length) return;

    const editor = this.#context.systems.editor;
    editor.perform(...actions);
    editor.commit({
      annotation: actions.length === 1 ? `Set level ${levelId}` : `Set level ${levelId} on ${actions.length} stops`,
      selectedIDs: stopIds
    });
  }

  /** Whether a stop is drawn only as the far end of a connection in the current view. */
  #isFarEnd(entityId: string): boolean {
    const view = this.view.value;
    const entity = view && this.#graph().hasEntity(entityId);
    return Boolean(entity) && isOutsideView(entity, view!, this.#stationIndex);
  }

  #graph(): any {
    return this.#context.systems.editor.staging.graph;
  }

  /** Every entity in the current edit (loaded data plus local changes). */
  #entities(): any[] {
    return graphEntities(this.#graph());
  }

  /**
   * Hooks level visibility into Rapid's FilterSystem. Rapid's own filters only
   * see tags, but a pathway's level comes from its end stops, so this wraps the
   * two methods the renderer and selection use instead of adding a filter rule.
   * Both short-circuit when no built-in filter is active, hence the wrapping.
   */
  #installLevelFilter() {
    const filters = this.#context.systems.filters;
    const isHidden = filters.isHidden.bind(filters);
    const filterScene = filters.filterScene.bind(filters);

    const hiddenByLevel = (entity: any, graph: any): boolean => {
      const view = this.view.value;
      if (!view || filters._forceVisible?.has(entity.id)) return false;
      return isHiddenInView(entity, view, id => graph.hasEntity(id), node => graph.parentWays(node), this.#stationIndex);
    };

    filters.isHidden = (entity: any, graph: any, geometry: string) =>
      hiddenByLevel(entity, graph) ? LEVEL_FILTER_ID : isHidden(entity, graph, geometry);
    filters.filterScene = (entities: any[], graph: any) =>
      filterScene(entities.filter(entity => !hiddenByLevel(entity, graph)), graph);
  }
}
