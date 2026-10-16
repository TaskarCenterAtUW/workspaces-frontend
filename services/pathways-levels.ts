// GTFS levels for pathways workspaces.
//
// A level is drawn in the editor as an area (a box) tagged with the levels.txt
// columns: level_id, level_index and level_name. The `level_index` tag is what
// marks an area as a level; stops never carry it. Stops point at a level with
// their own `level_id` tag, as in stops.txt. Pathways have no level in GTFS:
// a pathway is on whichever level(s) its end stops are on.
//
// These helpers are editor-agnostic: they work on plain { id, type, tags, nodes }
// entities so they can be unit tested and shared by the Rapid 3 integration
// (services/rapid3-levels.ts) and the GTFS export (services/pathways.ts).

export interface LevelEntity {
  id: string | number;
  type: string;
  tags?: Record<string, string>;
  /** Way node IDs, in order. */
  nodes?: (string | number)[];
}

export interface Level {
  /** The GTFS level_id. */
  levelId: string;
  /** level_index as a number, or undefined when it's missing or not numeric. */
  index: number | undefined;
  name: string;
  /** IDs of the areas drawn for this level (normally one). */
  areaIds: (string | number)[];
}

/**
 * location_type values for stops that should be on a level. Stations (1) span
 * levels, and entrances (2) are where riders come in from the street, so a
 * missing level_id isn't flagged for either (GTFS makes level_id optional).
 */
const LEVELED_LOCATION_TYPES = new Set(['', '0', '3', '4']);

export function isLevelArea(entity: LevelEntity): boolean {
  return entity.type === 'way' && entity.tags?.level_index !== undefined;
}

/** A way that is a GTFS pathway: any way that isn't a level area and has two ends. */
export function isPathway(entity: LevelEntity): boolean {
  return entity.type === 'way' && !isLevelArea(entity) && (entity.nodes?.length ?? 0) >= 2;
}

/**
 * The stop nodes: a pathway's end nodes, plus any tagged node. Untagged nodes
 * that only shape a line or a level box are geometry, not stops.
 */
export function stopNodes<T extends LevelEntity>(entities: T[]): T[] {
  const endpointIds = new Set(
    entities.filter(isPathway).flatMap(way => [way.nodes![0], way.nodes!.at(-1)])
  );
  return entities.filter(entity => entity.type === 'node'
    && (endpointIds.has(entity.id) || Object.keys(entity.tags ?? {}).length > 0));
}

/** The level_id a stop is on, or undefined. */
export function stopLevelId(entity: LevelEntity): string | undefined {
  const levelId = entity.tags?.level_id?.trim();
  return levelId || undefined;
}

/** Stops that should be on a level but have no level_id (stations and entrances are exempt). */
export function unleveledStops<T extends LevelEntity>(entities: T[]): T[] {
  return stopNodes(entities).filter(stop => !stopLevelId(stop)
    && LEVELED_LOCATION_TYPES.has(stop.tags?.location_type?.trim() ?? ''));
}

function parseIndex(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const index = Number(value);
  return Number.isFinite(index) ? index : undefined;
}

/** Orders levels by level_index (lowest first, unknown last), then by level_id. */
export function compareLevels(a: Level, b: Level): number {
  if (a.index !== b.index) {
    if (a.index === undefined) return 1;
    if (b.index === undefined) return -1;
    return a.index - b.index;
  }
  return a.levelId.localeCompare(b.levelId, undefined, { numeric: true });
}

/**
 * All known levels, sorted: one per level_id from the drawn level areas, plus
 * any level_id that stops use but no area defines yet (e.g. imported data).
 * Level areas with no level_id are left out; see {@link levelAreasMissingId}.
 */
export function collectLevels(entities: LevelEntity[]): Level[] {
  const levels = new Map<string, Level>();

  for (const area of entities.filter(isLevelArea)) {
    const levelId = area.tags!.level_id?.trim();
    if (!levelId) continue;

    const level = levels.get(levelId);
    if (level) {
      level.areaIds.push(area.id);
      level.index ??= parseIndex(area.tags!.level_index);
      level.name ||= area.tags!.level_name?.trim() ?? '';
    } else {
      levels.set(levelId, {
        levelId,
        index: parseIndex(area.tags!.level_index),
        name: area.tags!.level_name?.trim() ?? '',
        areaIds: [area.id]
      });
    }
  }

  for (const stop of stopNodes(entities)) {
    const levelId = stopLevelId(stop);
    if (levelId && !levels.has(levelId)) {
      levels.set(levelId, { levelId, index: undefined, name: '', areaIds: [] });
    }
  }

  return [...levels.values()].sort(compareLevels);
}

/**
 * A readable level_id for a level at `index` (e.g. "L0", "L-1", "L2.5") that no
 * existing level uses; a numeric suffix is added if it's taken ("L0-2").
 */
export function suggestLevelId(index: number, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const base = `L${index}`;
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/** The next level_index above every known level (0 when there are none). */
export function nextLevelIndex(levels: Level[]): number {
  const indexes = levels.map(level => level.index).filter((index): index is number => index !== undefined);
  return indexes.length ? Math.floor(Math.max(...indexes)) + 1 : 0;
}

/**
 * New level_index values for levels the user has put in `order` (top to
 * bottom, i.e. highest first). GTFS level_index is relative to ground level
 * (0), so the ground level keeps 0 and every other level is numbered by its
 * distance above (+) or below (-) it. Without a level at 0, the level closest
 * to 0 keeps its index; without any numeric index, the bottom level becomes 0.
 */
export function reorderedLevelIndexes(order: Level[]): Map<string, number> {
  const indexes = new Map<string, number>();
  if (!order.length) return indexes;

  let anchor = order.findIndex(level => level.index === 0);
  if (anchor < 0) {
    let closest = Infinity;
    order.forEach((level, position) => {
      if (level.index !== undefined && Math.abs(level.index) < closest) {
        closest = Math.abs(level.index);
        anchor = position;
      }
    });
  }
  if (anchor < 0) anchor = order.length - 1;

  const anchorIndex = order[anchor]!.index ?? 0;
  order.forEach((level, position) => {
    indexes.set(level.levelId, anchorIndex + (anchor - position));
  });
  return indexes;
}

/**
 * Orders levels the way the level panel shows them: drawn levels highest
 * first (unknown indexes after them), then levels only stops use.
 */
export function levelsTopDown(levels: Level[]): Level[] {
  const drawn = levels.filter(level => level.areaIds.length);
  const known = drawn.filter(level => level.index !== undefined).sort((a, b) => compareLevels(b, a));
  const unknown = drawn.filter(level => level.index === undefined);
  return [...known, ...unknown, ...levels.filter(level => !level.areaIds.length)];
}

export interface Station {
  /** The station's entity ID. */
  id: string | number;
  /** The station's GTFS stop_id, which stops reference as parent_station. */
  stopId: string;
  name: string;
}

export interface StationLevelGroup {
  /** The station, or undefined for the levels no station's stops use. */
  station: Station | undefined;
  /** The levels this station's stops are on, highest first (see `levelsTopDown`). */
  levels: Level[];
}

/**
 * Which station each stop belongs to. GTFS levels don't belong to a station;
 * the link is through stops, which have both a level_id and a parent_station.
 * A boarding area's parent_station is its platform, so that's followed up to
 * the platform's station. Stations are identified by their stop_id (what
 * parent_station holds), so a station without one can't have stops.
 */
export interface StationIndex {
  /** Stations by entity ID. */
  stations: Map<string | number, Station>;
  /** Stop entity ID -> the stop_id of its station, for stops in a station. */
  stationOfStop: Map<string | number, string>;
  /** level_id -> stop_ids of the stations whose stops are on that level. */
  stationsByLevel: Map<string, Set<string>>;
}

export function buildStationIndex(entities: LevelEntity[]): StationIndex {
  const stops = stopNodes(entities);
  const byStopId = new Map<string, LevelEntity>();
  for (const stop of stops) {
    const stopId = stop.tags?.stop_id?.trim();
    if (stopId && !byStopId.has(stopId)) byStopId.set(stopId, stop);
  }

  const isStation = (entity: LevelEntity | undefined) => entity?.tags?.location_type?.trim() === '1';
  const stations = new Map<string | number, Station>();
  for (const [stopId, stop] of byStopId) {
    if (isStation(stop)) {
      stations.set(stop.id, { id: stop.id, stopId, name: stop.tags?.stop_name?.trim() || stopId });
    }
  }

  const stationOfStop = new Map<string | number, string>();
  const stationsByLevel = new Map<string, Set<string>>();
  for (const stop of stops) {
    if (isStation(stop)) continue;
    let parent = byStopId.get(stop.tags?.parent_station?.trim() ?? '');
    if (parent && !isStation(parent) && stop.tags?.location_type?.trim() === '4') {
      parent = byStopId.get(parent.tags?.parent_station?.trim() ?? ''); // boarding area -> platform -> station
    }
    if (!parent || !isStation(parent)) continue;

    const stationId = parent.tags!.stop_id!.trim();
    stationOfStop.set(stop.id, stationId);
    const levelId = stopLevelId(stop);
    if (levelId) {
      const stationIds = stationsByLevel.get(levelId) ?? new Set<string>();
      stationIds.add(stationId);
      stationsByLevel.set(levelId, stationIds);
    }
  }

  return { stations, stationOfStop, stationsByLevel };
}

/**
 * Groups levels by the stations whose stops use them (see `StationIndex`).
 * The first group, with no station, holds the levels no station's stops use
 * (e.g. a just-drawn outline); it's always present. Then one group per station
 * (sorted by name), including stations with no levels yet. A level used by
 * several stations (e.g. a shared street level) is listed under each.
 */
export function levelsByStation(entities: LevelEntity[], index = buildStationIndex(entities)): StationLevelGroup[] {
  const levels = collectLevels(entities);
  const stations = [...index.stations.values()]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.stopId.localeCompare(b.stopId));

  return [
    { station: undefined, levels: levelsTopDown(levels.filter(level => !index.stationsByLevel.has(level.levelId))) },
    ...stations.map(station => ({
      station,
      levels: levelsTopDown(levels.filter(level => index.stationsByLevel.get(level.levelId)?.has(station.stopId)))
    }))
  ];
}

/**
 * What the map shows: one level; only features not tied to a station; or one
 * station's features that have no level (e.g. its street entrances).
 */
export type LevelView = { kind: 'level'; levelId: string }
  | { kind: 'noStation' }
  | { kind: 'stationNoLevel'; stationId: string };

/**
 * Whether a stop belongs to something other than what the view shows: another
 * level, or (in station views) another station or a level. Such a stop is
 * only on the map as the far end of a shown pathway, so the editor fades it.
 * Untagged nodes and stops with no level in a level view aren't outside.
 */
export function isOutsideView(node: LevelEntity, view: LevelView, index: StationIndex): boolean {
  if (node.type !== 'node' || !Object.keys(node.tags ?? {}).length) return false;

  if (view.kind === 'level') {
    const nodeLevel = stopLevelId(node);
    return Boolean(nodeLevel) && nodeLevel !== view.levelId;
  }

  const station = index.stations.get(node.id);
  if (view.kind === 'noStation') {
    return Boolean(station) || index.stationOfStop.has(node.id);
  }
  if (station) return station.stopId !== view.stationId;
  return index.stationOfStop.get(node.id) !== view.stationId || Boolean(stopLevelId(node));
}

/**
 * Decides whether a feature is hidden in a view. Level views follow
 * `isHiddenOnLevel`. In the station views:
 * - `noStation` shows stops not in any station, the level areas no station
 *   uses, and pathways touching a shown stop;
 * - `stationNoLevel` shows the station itself, its stops with no level_id,
 *   and pathways touching them; no level areas.
 * As with levels, a hidden stop stays visible while a shown pathway uses it,
 * and untagged nodes (bends, box corners) follow the ways they shape.
 */
export function isHiddenInView(
  entity: LevelEntity,
  view: LevelView,
  getEntity: (id: string | number) => LevelEntity | undefined,
  parentWays: (node: LevelEntity) => LevelEntity[],
  index: StationIndex
): boolean {
  if (view.kind === 'level') {
    return isHiddenOnLevel(entity, view.levelId, getEntity, parentWays);
  }

  // An untagged pathway end belongs to no station: shown only by "No station".
  const stopShown = (node: LevelEntity): boolean => (Object.keys(node.tags ?? {}).length
    ? !isOutsideView(node, view, index)
    : view.kind === 'noStation');
  const pathwayShown = (way: LevelEntity): boolean => [way.nodes![0], way.nodes!.at(-1)]
    .map(id => getEntity(id!))
    .some(node => node !== undefined && stopShown(node));

  if (entity.type === 'way') {
    if (isLevelArea(entity)) {
      if (view.kind === 'stationNoLevel') return true;
      const levelId = entity.tags!.level_id?.trim();
      return Boolean(levelId) && index.stationsByLevel.has(levelId!);
    }
    return isPathway(entity) ? !pathwayShown(entity) : false;
  }

  if (entity.type === 'node') {
    const parents = parentWays(entity);
    if (Object.keys(entity.tags ?? {}).length === 0) {
      return parents.length > 0
        && parents.every(way => isHiddenInView(way, view, getEntity, parentWays, index));
    }
    if (stopShown(entity)) return false;
    return !parents.some(way => isPathway(way) && pathwayShown(way));
  }

  return false;
}

/** Meters per degree of latitude (and of longitude at the equator). */
const METERS_PER_DEGREE = 111_320;

/**
 * The corners of a box around the given [lon, lat] points, padded by
 * `paddingMeters` on every side (so a single point gets a square), in drawing
 * order: south-west, south-east, north-east, north-west.
 */
export function levelBoxCorners(locs: [number, number][], paddingMeters = 10): [number, number][] {
  if (!locs.length) return [];

  const lons = locs.map(([lon]) => lon);
  const lats = locs.map(([, lat]) => lat);
  const [west, east] = [Math.min(...lons), Math.max(...lons)];
  const [south, north] = [Math.min(...lats), Math.max(...lats)];

  const padLat = paddingMeters / METERS_PER_DEGREE;
  const midLat = ((south + north) / 2) * Math.PI / 180;
  const padLon = paddingMeters / (METERS_PER_DEGREE * Math.max(Math.cos(midLat), 0.01));

  return [
    [west - padLon, south - padLat],
    [east + padLon, south - padLat],
    [east + padLon, north + padLat],
    [west - padLon, north + padLat]
  ];
}

/** The level_index of a level area as a number, if it has a numeric one. */
export function levelAreaIndex(area: LevelEntity): number | undefined {
  return parseIndex(area.tags?.level_index);
}

/** Level areas that can't be referenced because they have no level_id. */
export function levelAreasMissingId<T extends LevelEntity>(entities: T[]): T[] {
  return entities.filter(entity => isLevelArea(entity) && !entity.tags!.level_id?.trim());
}

/** Groups stops by level_id, in level order; unleveled stops are under `undefined`, last. */
export function stopsByLevel<T extends LevelEntity>(entities: T[]): { level: Level | undefined; stops: T[] }[] {
  const stops = stopNodes(entities);
  const groups = collectLevels(entities).map(level => ({
    level: level as Level | undefined,
    stops: stops.filter(stop => stopLevelId(stop) === level.levelId)
  }));
  const unleveled = stops.filter(stop => !stopLevelId(stop));
  if (unleveled.length) {
    groups.push({ level: undefined, stops: unleveled });
  }
  return groups;
}

/**
 * Decides whether a feature is hidden while only `levelId` is shown.
 *
 * - Stops and level areas are hidden when they're on another level. Stops
 *   with no level stay visible, so they can be found and fixed.
 * - Untagged nodes (bends, level box corners) are hidden with their ways.
 * - A pathway is shown when either end is on this level, so connections to
 *   other levels (elevators, stairs) stay visible from both ends; it's hidden
 *   when its ends are only on other levels.
 * - A node on another level stays visible while a shown pathway uses it, so
 *   the far end of a connection can still be seen and selected.
 *
 * @param getEntity - looks up an entity by ID (for a pathway's end nodes)
 * @param parentWays - the ways a node belongs to
 */
export function isHiddenOnLevel(
  entity: LevelEntity,
  levelId: string,
  getEntity: (id: string | number) => LevelEntity | undefined,
  parentWays: (node: LevelEntity) => LevelEntity[]
): boolean {
  const pathwayHidden = (way: LevelEntity): boolean => {
    const endLevels = [way.nodes![0], way.nodes!.at(-1)]
      .map(id => getEntity(id!))
      .map(node => (node ? stopLevelId(node) : undefined));
    return endLevels.some(Boolean) && !endLevels.includes(levelId);
  };

  if (entity.type === 'way') {
    if (isLevelArea(entity)) {
      const areaLevel = entity.tags!.level_id?.trim();
      return Boolean(areaLevel) && areaLevel !== levelId;
    }
    return isPathway(entity) ? pathwayHidden(entity) : false;
  }

  if (entity.type === 'node') {
    const nodeLevel = stopLevelId(entity);
    const parents = parentWays(entity);

    if (!nodeLevel) {
      // Tagged stops without a level stay visible so they can be fixed; untagged
      // nodes (bends, level box corners) follow the ways they shape.
      if (Object.keys(entity.tags ?? {}).length > 0) return false;
      return parents.length > 0
        && parents.every(way => isHiddenOnLevel(way, levelId, getEntity, parentWays));
    }
    if (nodeLevel === levelId) return false;
    return !parents.some(way => isPathway(way) && !pathwayHidden(way));
  }

  return false;
}
