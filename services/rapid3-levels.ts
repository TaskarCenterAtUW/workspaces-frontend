import { computed, ref, shallowRef } from 'vue';
import {
  collectLevels,
  buildStationIndex,
  isHiddenInView,
  isLevelArea,
  isOutsideView,
  levelAreaIndex,
  levelAreasMissingId,
  levelBoxCorners,
  levelsByStation,
  levelsTopDown,
  nextLevelIndex,
  reorderedLevelIndexes,
  stopNodes,
  stopsByLevel,
  suggestLevelId,
  unleveledStops
} from '~/services/pathways-levels';
import type { Level, LevelView, StationIndex, StationLevelGroup } from '~/services/pathways-levels';
import { suggestedStopIds } from '~/services/gtfs-references';

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any;

/** The filter ID Rapid reports for features hidden because they're on another level. */
export const LEVEL_FILTER_ID = 'gtfs_other_levels';

/** Opacity of stops on the map only as the far end of a shown connection. */
export const FAR_END_ALPHA = 0.35;

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
  label: string;
}

/** The fields whose choices are the workspace's defined levels / stations / platforms. */
export const REFERENCE_FIELDS = ['level_id', 'parent_station'] as const;

/** A stop as shown in the level panel. */
export interface LevelStop {
  id: string;
  label: string;
  levelId: string | undefined;
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
   * stop_ids of the stations with features in the map view (the station, its
   * stops, or its levels' outlines), or undefined when that isn't known yet.
   */
  readonly visibleStationIds = shallowRef<Set<string> | undefined>();
  /** Stops grouped by level in level order, unleveled stops last. */
  readonly stopGroups = shallowRef<LevelStopGroup[]>([]);
  /** Stops that should be on a level but have no level_id. */
  readonly unleveled = shallowRef<LevelStop[]>([]);
  /** Level areas without a level_id (so stops can't reference them). */
  readonly levelAreasMissingId = shallowRef<LevelStop[]>([]);
  /** The level being shown, or undefined to show all levels. */
  /** What the map is filtered to, or undefined to show everything. */
  readonly view = ref<LevelView | undefined>();
  /** The level being shown, when the view is a level. */
  readonly currentLevelId = computed(() => (this.view.value?.kind === 'level' ? this.view.value.levelId : undefined));

  #context: any;
  #refreshTimer: ReturnType<typeof setTimeout> | undefined;
  #viewportTimer: ReturnType<typeof setTimeout> | undefined;
  #stationIndex: StationIndex = { stations: new Map(), stationOfStop: new Map(), stationsByLevel: new Map() };
  /** Stations to offer as a parent_station (incl. ones getting a suggested stop_id). */
  #stations: ReferenceChoice[] = [];
  /** Platforms to offer as a boarding area's parent_station (likewise). */
  #platforms: ReferenceChoice[] = [];
  #assigningStopIds = false;

  constructor(context: any) {
    this.#context = context;
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

    // Track which stations are in view as the map moves.
    context.systems.map?.on?.('mapchange', () => {
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
    this.levels.value = levels;
    this.levelGroups.value = levelsByStation(entities, this.#stationIndex);
    const { stations, stationOfStop } = this.#stationIndex;
    this.noStationStopCount.value = stopNodes(entities)
      .filter(stop => !stations.has(stop.id) && !stationOfStop.has(stop.id)).length;
    this.stopGroups.value = stopsByLevel(entities)
      .map(({ level, stops }) => ({ level, stops: stops.map(describeStop) }));
    this.unleveled.value = unleveledStops(entities).map(describeStop);
    this.levelAreasMissingId.value = levelAreasMissingId(entities)
      .map(area => ({ id: area.id, label: area.tags?.level_name?.trim() || area.id, levelId: undefined }));
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
    }
  }

  /**
   * The defined values a reference field can take: drawn levels for level_id
   * (highest first); stations for parent_station, or platforms when the
   * feature is a boarding area. Undefined for other keys.
   * @param entityId - the feature being edited, if known
   */
  referenceChoices(key: string, entityId?: string): ReferenceChoice[] | undefined {
    if (key === 'level_id') {
      return levelsTopDown(this.levels.value.filter(level => level.areaIds.length))
        .map(level => choice(level.levelId, level.name));
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
   * Recomputes which stations have features in the map view, from Rapid's
   * spatial index of what's on screen (the same one it draws from).
   */
  updateVisibleStations() {
    const editor = this.#context.systems.editor;
    if (typeof editor.intersects !== 'function') return; // can't tell: list every station

    const { stations, stationOfStop, stationsByLevel } = this.#stationIndex;
    const ids = new Set<string>();
    for (const entity of editor.intersects()) {
      const station = stations.get(entity.id);
      if (station) ids.add(station.stopId);
      const stationId = stationOfStop.get(entity.id);
      if (stationId) ids.add(stationId);
      if (isLevelArea(entity)) {
        for (const id of stationsByLevel.get(entity.tags.level_id?.trim()) ?? []) ids.add(id);
      }
    }
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
    gfx?.immediateRedraw();
  }

  /** Pans and zooms the map to a level's area, or to its stops if it has no area. */
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
      ?? suggestLevelId(index, this.levels.value.map(l => l.levelId));

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
   * Outlines levels that stops use but that have no outline yet, each with a
   * box around its stops (padded, so a single stop gets a square), as one
   * undoable edit. They're stacked above the highest level (level_index);
   * drag them into order afterwards. With one level, the new outline is
   * selected for reshaping.
   * @returns the new outlines' way IDs
   */
  outlineLevels(levelIds: string[]): string[] {
    const byLevel = new Map<string, [number, number][]>();
    for (const stop of stopNodes(this.#entities())) {
      const levelId = stop.tags?.level_id?.trim();
      if (levelId && stop.loc) byLevel.set(levelId, [...(byLevel.get(levelId) ?? []), stop.loc]);
    }

    const known = new Map(this.levels.value.map(level => [level.levelId, level]));
    const toOutline = levelIds.filter(id => known.has(id) && !known.get(id)!.areaIds.length && byLevel.has(id));
    if (!toOutline.length) return [];

    let index = nextLevelIndex(this.levels.value);
    const actions: unknown[] = [];
    const wayIds: string[] = [];
    for (const levelId of toOutline) {
      const corners = levelBoxCorners(byLevel.get(levelId)!)
        .map(loc => new Rapid.OsmNode(this.#context, { loc }));
      const way = new Rapid.OsmWay(this.#context, {
        nodes: [...corners.map(node => node.id), corners[0].id],
        tags: { area: 'yes', level_id: levelId, level_index: String(index++) }
      });
      actions.push(...corners.map(node => Rapid.actionAddEntity(node)), Rapid.actionAddEntity(way));
      wayIds.push(way.id);
    }

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
   * Gives a level area that has no level_id a generated one, based on its
   * level_index, so stops can reference it.
   * @returns the new level_id
   */
  fillLevelId(areaId: string): string | undefined {
    const area = this.#graph().hasEntity(areaId);
    if (!area || area.tags?.level_id?.trim()) return undefined;

    const index = levelAreaIndex(area) ?? nextLevelIndex(this.levels.value);
    const levelId = suggestLevelId(index, this.levels.value.map(level => level.levelId));

    const editor = this.#context.systems.editor;
    editor.perform(Rapid.actionChangeTags(areaId, { ...area.tags, level_id: levelId }));
    editor.commit({ annotation: `Set level_id ${levelId}`, selectedIDs: [areaId] });
    return levelId;
  }

  /**
   * Renumbers level_index after the user reorders levels (top to bottom, i.e.
   * highest first) — see `reorderedLevelIndexes`. Only levels with an outline
   * can be reordered, since that's where level_index is stored. Every outline of
   * each level whose index changes is updated, as one undoable edit.
   */
  reorderLevels(levelIdsTopDown: string[]) {
    const byId = new Map(this.levels.value.map(level => [level.levelId, level]));
    const order = levelIdsTopDown
      .map(id => byId.get(id))
      .filter((level): level is Level => Boolean(level?.areaIds.length));
    const indexes = reorderedLevelIndexes(order);

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
    editor.commit({ annotation: 'Reordered levels', selectedIDs: [] });
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
