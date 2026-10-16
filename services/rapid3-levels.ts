import { ref, shallowRef } from 'vue';
import {
  collectLevels,
  isHiddenOnLevel,
  levelAreaIndex,
  levelAreasMissingId,
  nextLevelIndex,
  stopsByLevel,
  suggestLevelId,
  unleveledStops
} from '~/services/pathways-levels';
import type { Level } from '~/services/pathways-levels';

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any;

/** The filter ID Rapid reports for features hidden because they're on another level. */
export const LEVEL_FILTER_ID = 'gtfs_other_levels';

/** GTFS pathway_mode values offered when connecting two stops. */
export const PATHWAY_MODES = [
  { value: '5', label: 'Elevator' },
  { value: '2', label: 'Stairs' },
  { value: '4', label: 'Escalator' },
  { value: '1', label: 'Walkway' },
  { value: '3', label: 'Moving sidewalk' },
  { value: '6', label: 'Fare gate' },
  { value: '7', label: 'Exit gate' }
];

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
  '3': 'Node',
  '4': 'Boarding area'
};

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
 * Selecting a level hides features on other levels (see `isHiddenOnLevel`).
 * Edits (setting levels, connecting stops) go through Rapid's editor, so they
 * can be undone and are uploaded like any other change.
 */
export class Rapid3LevelTools {
  /** Known levels, sorted by level_index. */
  readonly levels = shallowRef<Level[]>([]);
  /** Stops grouped by level in level order, unleveled stops last. */
  readonly stopGroups = shallowRef<LevelStopGroup[]>([]);
  /** Stops that should be on a level but have no level_id. */
  readonly unleveled = shallowRef<LevelStop[]>([]);
  /** Level areas without a level_id (so stops can't reference them). */
  readonly levelAreasMissingId = shallowRef<LevelStop[]>([]);
  /** The level being shown, or undefined to show all levels. */
  readonly currentLevelId = ref<string | undefined>();

  #context: any;
  #refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(context: any) {
    this.#context = context;
    this.#installLevelFilter();

    // Data arrives in many small merges while loading; batch the refreshes.
    const editor = context.systems.editor;
    const scheduleRefresh = () => {
      clearTimeout(this.#refreshTimer);
      this.#refreshTimer = setTimeout(() => this.refresh(), 100);
    };
    for (const event of ['merge', 'stablechange', 'historyjump']) {
      editor.on(event, scheduleRefresh);
    }
    this.refresh();
  }

  /** Recomputes the level, stop and unleveled lists from the current edit. */
  refresh() {
    const entities = this.#entities();
    const levels = collectLevels(entities);

    this.levels.value = levels;
    this.stopGroups.value = stopsByLevel(entities)
      .map(({ level, stops }) => ({ level, stops: stops.map(describeStop) }));
    this.unleveled.value = unleveledStops(entities).map(describeStop);
    this.levelAreasMissingId.value = levelAreasMissingId(entities)
      .map(area => ({ id: area.id, label: area.tags?.level_name?.trim() || area.id, levelId: undefined }));

    // Drop a selected level that no longer exists.
    if (this.currentLevelId.value && !levels.some(level => level.levelId === this.currentLevelId.value)) {
      this.showLevel(undefined);
    }
  }

  /** Shows only features on the given level (and unleveled stops), or every level. */
  showLevel(levelId: string | undefined) {
    this.currentLevelId.value = levelId;

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

  /**
   * Creates a pathway between two stops (e.g. an elevator between levels) and
   * selects it. Exit gates are always one-way, as GTFS requires.
   * @returns the new way's ID
   */
  connect(fromId: string, toId: string, pathwayMode: string, bidirectional: boolean): string | undefined {
    if (!fromId || !toId || fromId === toId) return undefined;

    const graph = this.#graph();
    if (!graph.hasEntity(fromId) || !graph.hasEntity(toId)) return undefined;

    const mode = PATHWAY_MODES.find(m => m.value === pathwayMode);
    const isBidirectional = bidirectional && pathwayMode !== '7';
    const way = new Rapid.OsmWay(this.#context, {
      nodes: [fromId, toId],
      tags: { pathway_mode: pathwayMode, is_bidirectional: isBidirectional ? '1' : '0' }
    });

    const editor = this.#context.systems.editor;
    editor.perform(Rapid.actionAddEntity(way));
    editor.commit({ annotation: `Added ${mode?.label.toLowerCase() ?? 'pathway'}`, selectedIDs: [way.id] });
    this.#context.enter('select-osm', { selection: { osm: [way.id] } });

    return way.id;
  }

  #graph(): any {
    return this.#context.systems.editor.staging.graph;
  }

  /** Every entity in the current edit (loaded data plus local changes). */
  #entities(): any[] {
    const graph = this.#graph();
    const ids = new Set([...graph.base.entities.keys(), ...graph.local.entities.keys()]);
    const entities: any[] = [];
    for (const id of ids) {
      const entity = graph.hasEntity(id); // undefined if deleted locally
      if (entity) entities.push(entity);
    }
    return entities;
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
      const levelId = this.currentLevelId.value;
      if (!levelId || filters._forceVisible?.has(entity.id)) return false;
      return isHiddenOnLevel(entity, levelId, id => graph.hasEntity(id), node => graph.parentWays(node));
    };

    filters.isHidden = (entity: any, graph: any, geometry: string) =>
      hiddenByLevel(entity, graph) ? LEVEL_FILTER_ID : isHidden(entity, graph, geometry);
    filters.filterScene = (entities: any[], graph: any) =>
      filterScene(entities.filter(entity => !hiddenByLevel(entity, graph)), graph);
  }
}
