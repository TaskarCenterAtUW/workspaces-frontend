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
