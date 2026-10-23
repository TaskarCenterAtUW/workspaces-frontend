// Level problems shown as Rapid issues (they used to be the Stations panel's
// warnings): stops with no level_id, level outlines with no level_id, outlines
// that are very large or much bigger than their stops need, stops far from
// the rest of their level, stops and pathways outside their level's outline,
// and stations whose levels aren't numbered 0, 1, 2... Each carries what its
// fix needs.
import { TYPE_NAMES } from '~/services/gtfs-references';
import {
  buildStationIndex,
  collectLevels,
  farStops,
  isLevelArea,
  isPathway,
  largeLevelAreas,
  levelAreasMissingId,
  levelsLowestFirst,
  MAX_LEVEL_DISTANCE,
  stopLevelId,
  unleveledStops
} from '~/services/pathways-levels';
import type { LevelEntity } from '~/services/pathways-levels';

export type LevelCheckSubtype
  = 'missing_level' | 'level_area_no_id' | 'large_outline' | 'far_stop' | 'station_level_order' | 'outside_level';

export interface LevelProblem {
  subtype: LevelCheckSubtype;
  message: string;
  /** Identifies the problem, so Rapid can tell it apart from others on the same feature. */
  hash: string;
  /** For a stop with no level: the levels its station's stops use, to pick from. */
  levelOptions?: { levelId: string; label: string }[];
  /** For an outline: its level_id (so it can be refit). */
  levelId?: string;
  /** For a station whose levels aren't numbered 0, 1, 2...: its levels, lowest first, to renumber. */
  stationLevelIds?: string[];
  /** For a stop outside its level: that level's outline, if it's the only one and a plain box (so Refit can fix it). */
  refitAreaId?: string;
}

/** "620 m" or "2.3 km". */
export function distanceLabel(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Finds every level problem in the workspace, by feature ID (some depend on
 * the whole level or station, so they're found together).
 * @param locOf - a node's [lon, lat], if known
 */
export function levelProblems(
  entities: (LevelEntity & { loc?: [number, number] })[],
  locOf: (id: string | number) => [number, number] | undefined
): Map<string | number, LevelProblem[]> {
  const problems = new Map<string | number, LevelProblem[]>();
  const add = (id: string | number, problem: LevelProblem) => problems.set(id, [...(problems.get(id) ?? []), problem]);
  const typeName = (entity: LevelEntity) => TYPE_NAMES[entity.tags?.location_type?.trim() ?? ''] ?? 'stop';

  // Levels each station's stops use, lowest first, as choices for its unleveled stops.
  const { stationOfStop, stations, stationsByLevel } = buildStationIndex(entities);
  const levels = levelsLowestFirst(collectLevels(entities));
  const label = (levelId: string, name: string) => (name && name !== levelId ? `${name} (${levelId})` : levelId);
  const optionsFor = (stationId: string | undefined) => levels
    .filter(level => stationId && stationsByLevel.get(level.levelId)?.has(stationId))
    .map(level => ({ levelId: level.levelId, label: label(level.levelId, level.name) }));

  // As TDEI's validation checks them: stops with no level_id in a station that uses levels.
  const stationsUsingLevels = new Set([...stationsByLevel.values()].flatMap(ids => [...ids]));
  for (const stop of unleveledStops(entities)) {
    if (!stationsUsingLevels.has(stationOfStop.get(stop.id) ?? '')) continue;
    add(stop.id, {
      subtype: 'missing_level',
      message: `This ${typeName(stop)} has no level_id`,
      hash: 'missing_level',
      levelOptions: optionsFor(stationOfStop.get(stop.id))
    });
  }

  // GTFS numbers levels from street level: 0 at the street, positive above and
  // negative below (gaps are fine). A station's levels each need their own
  // number, and numbers far from 0 were counted across the whole feed.
  for (const station of stations.values()) {
    const ordered = levels.filter(level => level.index !== undefined && stationsByLevel.get(level.levelId)?.has(station.stopId));
    if (!ordered.length) continue;
    const indexes = ordered.map(level => level.index!);
    const repeated = [...new Set(indexes.filter((index, i) => indexes.indexOf(index) !== i))];
    const farFromStreet = Math.min(...indexes.map(Math.abs)) > MAX_LEVEL_DISTANCE;
    if (!repeated.length && !farFromStreet) continue;
    let message: string;
    if (repeated.length) {
      message = `Station ${station.name} has more than one level numbered ${repeated.join(' and ')}`;
    } else if (indexes.length === 1) {
      message = `Station ${station.name}'s only level is numbered ${indexes[0]}, far from street level (0)`;
    } else {
      message = `Station ${station.name}'s levels are numbered ${indexes[0]} to ${indexes.at(-1)}, far from street level (0)`;
    }
    add(station.id, {
      subtype: 'station_level_order',
      message,
      hash: 'station_level_order',
      stationLevelIds: ordered.map(level => level.levelId)
    });
  }

  for (const area of levelAreasMissingId(entities)) {
    add(area.id, { subtype: 'level_area_no_id', message: 'This level outline has no level_id', hash: 'level_area_no_id' });
  }

  for (const { area, meters, stopsMeters, oversized } of largeLevelAreas(entities, locOf)) {
    const levelId = area.tags?.level_id?.trim() || undefined;
    const levelName = area.tags?.level_name?.trim() ?? '';
    const name = levelId ? label(levelId, levelName) : levelName || String(area.id);
    add(area.id, {
      subtype: 'large_outline',
      message: oversized && stopsMeters !== undefined
        ? `Level ${name} is ${distanceLabel(meters)} across, but its stops fit in ${distanceLabel(stopsMeters)}`
        : `Level ${name} is ${distanceLabel(meters)} across; check its outline`,
      hash: 'large_outline',
      levelId
    });
  }

  // Stops far from the rest of their level, within their own station (as TDEI's
  // validation checks them; stations may share level_ids).
  const stopsByStation = new Map<string, typeof entities>();
  for (const entity of entities) {
    const stationId = stationOfStop.get(entity.id);
    if (stationId) stopsByStation.set(stationId, [...(stopsByStation.get(stationId) ?? []), entity]);
  }
  const far = [...stopsByStation.values()].flatMap(stops => farStops(stops));
  for (const { stop, levelId, meters } of far) {
    add(stop.id, {
      subtype: 'far_stop',
      message: `This ${typeName(stop)} is ${distanceLabel(meters)} from the rest of level ${levelId}`,
      hash: `far_stop:${levelId}`
    });
  }

  // Stops and pathways outside the outline of the level they're on. A pathway
  // is checked only when both ends are on the same level (pathways to another
  // level, or to a stop with no level, aren't), and then every point along it,
  // bends included, should be inside that level's outlines.
  const outlinesByLevel = new Map<string, { id: string | number; ring: [number, number][]; isBox: boolean }[]>();
  for (const area of entities.filter(isLevelArea)) {
    const levelId = area.tags?.level_id?.trim();
    const ring = (area.nodes ?? []).map(locOf);
    if (!levelId || ring.length < 4 || ring.some(loc => !loc)) continue;
    const corners = new Set((area.nodes ?? []).slice(0, -1));
    const isBox = corners.size === 4 && area.nodes!.length === 5 && area.nodes![0] === area.nodes!.at(-1);
    outlinesByLevel.set(levelId, [...(outlinesByLevel.get(levelId) ?? []), { id: area.id, ring: ring as [number, number][], isBox }]);
  }
  const insideLevel = (loc: [number, number], levelId: string) =>
    (outlinesByLevel.get(levelId) ?? []).some(outline => pointInRing(loc, outline.ring));

  const byId = new Map(entities.map(entity => [entity.id, entity]));
  for (const stop of entities) {
    if (stop.type !== 'node' || !Object.keys(stop.tags ?? {}).length || !stop.loc) continue;
    const levelId = stopLevelId(stop);
    const outlines = levelId ? outlinesByLevel.get(levelId) : undefined;
    if (!levelId || !outlines?.length || insideLevel(stop.loc, levelId)) continue;
    add(stop.id, {
      subtype: 'outside_level',
      message: `This ${typeName(stop)} is outside level ${levelId}'s outline`,
      hash: `outside_level:${levelId}`,
      levelId,
      refitAreaId: outlines.length === 1 && outlines[0]!.isBox ? String(outlines[0]!.id) : undefined
    });
  }

  for (const way of entities.filter(isPathway)) {
    const [fromLevel, toLevel] = [way.nodes![0], way.nodes!.at(-1)]
      .map(id => byId.get(id!))
      .map(end => (end ? stopLevelId(end) : undefined));
    if (!fromLevel || fromLevel !== toLevel || !outlinesByLevel.get(fromLevel)?.length) continue;
    const outside = way.nodes!.some((id) => {
      const loc = locOf(id);
      return loc && !insideLevel(loc, fromLevel);
    });
    if (!outside) continue;
    add(way.id, {
      subtype: 'outside_level',
      message: `Part of this pathway is outside level ${fromLevel}'s outline`,
      hash: `outside_level:${fromLevel}`
    });
  }

  return problems;
}

/** Whether a [lon, lat] point is inside or on the edge of a closed ring of [lon, lat] points (ray casting). */
export function pointInRing([x, y]: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (onSegment([x, y], [xi, yi], [xj, yj])) return true;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether point p lies on the segment from a to b. */
function onSegment([x, y]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): boolean {
  const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const scale = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1e-12);
  if (Math.abs(cross) > 1e-12 * scale) return false;
  return x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
}
