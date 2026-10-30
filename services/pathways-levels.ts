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

/**
 * A level outline: a way with a level_index, or a closed area with a level_id
 * whose level_index is missing (still a level, not a pathway).
 */
export function isLevelArea(entity: LevelEntity): boolean {
  if (entity.type !== 'way') return false;
  if (entity.tags?.level_index !== undefined) return true;
  const nodes = entity.nodes ?? [];
  return entity.tags?.area === 'yes' && Boolean(entity.tags?.level_id?.trim())
    && nodes.length >= 4 && nodes[0] === nodes.at(-1);
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

/** Station stop_ids look like "STN_<code>" (e.g. STN_J02); level_ids build on the code. */
export const STATION_ID_PREFIX = 'STN_';

/** A station's code: its stop_id without the "STN_" prefix (J02 for STN_J02). */
export function stationCode(stopId: string): string {
  return stopId.startsWith(STATION_ID_PREFIX) ? stopId.slice(STATION_ID_PREFIX.length) : stopId;
}

/** Text as an ID part: upper case, with runs of other characters as "_" ("Van Dorn St." -> "VAN_DORN_ST"). */
export function idPart(text: string | undefined): string {
  return (text ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * The stop_id a station without one should get: "STN_" + its stop_code, or
 * its name when it has no code (e.g. STN_J02, STN_VAN_DORN_ST).
 */
export function stationStopIdBase(tags: Record<string, string> | undefined): string {
  return `${STATION_ID_PREFIX}${idPart(tags?.stop_code) || idPart(tags?.stop_name) || 'STATION'}`;
}

/**
 * A level_id for a level at `index` that no existing level uses: the codes of
 * the stations whose stops are on it, then "_L" and the index (J02_L0, or
 * J02_K01_L-1 for a level two stations share), or just "L0" with no station.
 * A numeric suffix is added if it's taken ("J02_L0-2").
 * @param stationIds - the stop_ids of the level's stations
 */
export function suggestLevelId(index: number, existingIds: Iterable<string>, stationIds: Iterable<string> = []): string {
  const taken = new Set(existingIds);
  const codes = [...new Set([...stationIds].map(stationCode))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const base = codes.length ? `${codes.join('_')}_L${index}` : `L${index}`;
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
 * New level_index values for levels the user has put in `order` (as the panel
 * lists them, lowest first). GTFS level_index is relative to ground level
 * (0), so the ground level keeps 0 and every other level is numbered by its
 * distance above (+) or below (-) it. Without a level at 0, the level closest
 * to 0 keeps its index; without any numeric index, the lowest level becomes 0.
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
  if (anchor < 0) anchor = 0;

  const anchorIndex = order[anchor]!.index ?? 0;
  order.forEach((level, position) => {
    indexes.set(level.levelId, anchorIndex + (position - anchor));
  });
  return indexes;
}

/**
 * How far from street level (0) a level_index can plausibly be. Indexes farther
 * than this were counted across the whole feed rather than within a station.
 */
export const MAX_LEVEL_DISTANCE = 20;

/**
 * level_index values that fix a station's numbering, in `order` (lowest first,
 * as the panel lists them): like `reorderedLevelIndexes`, but indexes farther
 * than MAX_LEVEL_DISTANCE from 0 are ignored, so a station numbered across
 * the whole feed starts again from 0.
 */
export function renumberedLevelIndexes(order: Level[]): Map<string, number> {
  const plausible = (level: Level) => level.index !== undefined && Math.abs(level.index) <= MAX_LEVEL_DISTANCE;
  return reorderedLevelIndexes(order.map(level => (plausible(level) ? level : { ...level, index: undefined })));
}

/**
 * Orders levels the way the level panel shows them: drawn levels lowest
 * first (unknown indexes after them), then levels only stops use.
 */
export function levelsLowestFirst(levels: Level[]): Level[] {
  const drawn = levels.filter(level => level.areaIds.length);
  const known = drawn.filter(level => level.index !== undefined).sort(compareLevels);
  const unknown = drawn.filter(level => level.index === undefined);
  return [...known, ...unknown, ...levels.filter(level => !level.areaIds.length)];
}

/**
 * Orders levels top to bottom, as a station stacks: drawn levels highest first
 * (above street level, then 0, then below it; unknown indexes after them), then
 * levels only stops use.
 */
export function levelsHighestFirst(levels: Level[]): Level[] {
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
  /** The levels this station's stops are on, lowest first (see `levelsLowestFirst`). */
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

/** A lon/lat bounding box: `min` is the southwest corner, `max` the northeast. */
export interface LonLatBox {
  min: [number, number];
  max: [number, number];
}

/**
 * The area each station covers, by stop_id: the box around its station point,
 * the stops in it, and the outlines of the levels only it uses. Outlines of
 * levels shared by several stations aren't counted, since such an outline can
 * span all of them.
 */
export function stationExtents(entities: (LevelEntity & { loc?: [number, number] })[], index: StationIndex): Map<string, LonLatBox> {
  const boxes = new Map<string, LonLatBox>();
  const add = (stopId: string, loc: [number, number] | undefined) => {
    if (!loc) return;
    const box = boxes.get(stopId);
    if (!box) {
      boxes.set(stopId, { min: [loc[0], loc[1]], max: [loc[0], loc[1]] });
      return;
    }
    box.min = [Math.min(box.min[0], loc[0]), Math.min(box.min[1], loc[1])];
    box.max = [Math.max(box.max[0], loc[0]), Math.max(box.max[1], loc[1])];
  };
  for (const entity of entities) {
    const stopId = index.stations.get(entity.id)?.stopId ?? index.stationOfStop.get(entity.id);
    if (stopId) add(stopId, entity.loc);
  }

  const locOf = new Map(entities.filter(entity => entity.loc).map(entity => [entity.id, entity.loc]));
  for (const area of entities.filter(isLevelArea)) {
    const stations = index.stationsByLevel.get(area.tags?.level_id?.trim() ?? '');
    if (stations?.size !== 1) continue; // no station, or shared
    const [stopId] = stations;
    for (const nodeId of area.nodes ?? []) add(stopId!, locOf.get(nodeId));
  }
  return boxes;
}

/** Whether two lon/lat boxes overlap (touching counts). */
export function boxesOverlap(a: LonLatBox, b: LonLatBox): boolean {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0] && a.min[1] <= b.max[1] && a.max[1] >= b.min[1];
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
    { station: undefined, levels: levelsLowestFirst(levels.filter(level => !index.stationsByLevel.has(level.levelId))) },
    ...stations.map(station => ({
      station,
      levels: levelsLowestFirst(levels.filter(level => index.stationsByLevel.get(level.levelId)?.has(station.stopId)))
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

/** Level outlines at least this many meters across are flagged to be checked. */
export const LARGE_LEVEL_METERS = 500;

/**
 * An outline is also flagged as bigger than it needs to be when it's at least
 * `ratio` times, and `excessMeters` more than, the box around its level's stops
 * (e.g. still stretched after a stray stop was fixed), at any size.
 */
export const OVERSIZED_LEVEL = { ratio: 2, excessMeters: 100 };

/** How far across the box around these locations is, in meters: its longer side. */
export function spanMeters(locs: [number, number][]): number {
  if (!locs.length) return 0;
  const lons = locs.map(([lon]) => lon);
  const lats = locs.map(([, lat]) => lat);
  const midLat = ((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI / 180;
  const width = (Math.max(...lons) - Math.min(...lons)) * METERS_PER_DEGREE * Math.cos(midLat);
  const height = (Math.max(...lats) - Math.min(...lats)) * METERS_PER_DEGREE;
  return Math.max(width, height);
}

/**
 * Level outlines that are probably wrong, largest first: those at least
 * `minMeters` across (e.g. a box around a level shared by stations far apart),
 * and those much bigger than the box around their level's stops (`oversized`,
 * see `OVERSIZED_LEVEL`). `stopsMeters` is how far across that box (padded like
 * a new outline) is, if the level has located stops.
 * @param locOf - a node's [lon, lat], if known
 */
export function largeLevelAreas<T extends LevelEntity & { loc?: [number, number] }>(
  entities: T[],
  locOf: (nodeId: string | number) => [number, number] | undefined,
  minMeters = LARGE_LEVEL_METERS
): { area: T; meters: number; stopsMeters: number | undefined; oversized: boolean }[] {
  const stopLocs = new Map<string, [number, number][]>();
  for (const stop of stopNodes(entities)) {
    const levelId = stopLevelId(stop);
    if (levelId && stop.loc) stopLocs.set(levelId, [...(stopLocs.get(levelId) ?? []), stop.loc]);
  }

  return entities
    .filter(isLevelArea)
    .map((area) => {
      const locs = (area.nodes ?? []).map(locOf).filter((loc): loc is [number, number] => Boolean(loc));
      const meters = spanMeters(locs);
      const levelId = area.tags?.level_id?.trim();
      const levelStops = levelId ? stopLocs.get(levelId) : undefined;
      const stopsMeters = levelStops ? spanMeters(levelBoxCorners(levelStops)) : undefined;
      const oversized = stopsMeters !== undefined
        && meters >= stopsMeters * OVERSIZED_LEVEL.ratio
        && meters - stopsMeters >= OVERSIZED_LEVEL.excessMeters;
      return { area, meters, stopsMeters, oversized };
    })
    .filter(({ meters, oversized }) => meters >= minMeters || oversized)
    .sort((a, b) => b.meters - a.meters);
}

/** Distance between two locations, in meters (flat-earth, fine at station scale). */
export function distanceMeters([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const midLat = ((lat1 + lat2) / 2) * Math.PI / 180;
  const dx = (lon2 - lon1) * METERS_PER_DEGREE * Math.cos(midLat);
  const dy = (lat2 - lat1) * METERS_PER_DEGREE;
  return Math.hypot(dx, dy);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Stops far from the rest of their level: at least `minMeters` from the
 * median location of the level's stops (so one stray stop can't pull the
 * middle toward itself), farthest first. Such a stop is often why a level's
 * outline is very large. Levels need 3 or more located stops to tell which
 * one is out of place.
 */
export function farStops<T extends LevelEntity & { loc?: [number, number] }>(
  entities: T[],
  minMeters = LARGE_LEVEL_METERS
): { stop: T; levelId: string; meters: number }[] {
  const byLevel = new Map<string, T[]>();
  for (const stop of stopNodes(entities)) {
    const levelId = stopLevelId(stop);
    if (levelId && stop.loc) byLevel.set(levelId, [...(byLevel.get(levelId) ?? []), stop]);
  }

  const far: { stop: T; levelId: string; meters: number }[] = [];
  for (const [levelId, stops] of byLevel) {
    if (stops.length < 3) continue;
    const middle: [number, number] = [median(stops.map(stop => stop.loc![0])), median(stops.map(stop => stop.loc![1]))];
    for (const stop of stops) {
      const meters = distanceMeters(stop.loc!, middle);
      if (meters >= minMeters) far.push({ stop, levelId, meters });
    }
  }
  return far.sort((a, b) => b.meters - a.meters);
}

/**
 * The stations (by stop_id) to highlight on the map: the one whose
 * "No level" view is shown, those whose stops use the level shown,
 * and any station selected in the editor.
 */
export function highlightedStationIds(
  view: LevelView | undefined,
  selectedIds: (string | number)[],
  index: StationIndex
): Set<string> {
  const ids = new Set<string>();
  if (view?.kind === 'stationNoLevel') ids.add(view.stationId);
  if (view?.kind === 'level') {
    for (const id of index.stationsByLevel.get(view.levelId) ?? []) ids.add(id);
  }
  for (const id of selectedIds) {
    const station = index.stations.get(id);
    if (station) ids.add(station.stopId);
  }
  return ids;
}
