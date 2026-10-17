// Level problems shown as Rapid issues (they used to be the Stations panel's
// warnings): stops with no level_id, level outlines with no level_id, outlines
// that are very large or much bigger than their stops need, and stops far from
// the rest of their level. Each carries what its fix needs.
import { TYPE_NAMES } from '~/services/gtfs-references';
import {
  buildStationIndex,
  collectLevels,
  farStops,
  largeLevelAreas,
  levelAreasMissingId,
  levelsLowestFirst,
  unleveledStops
} from '~/services/pathways-levels';
import type { LevelEntity } from '~/services/pathways-levels';

export type LevelCheckSubtype = 'missing_level' | 'level_area_no_id' | 'large_outline' | 'far_stop';

export interface LevelProblem {
  subtype: LevelCheckSubtype;
  message: string;
  /** Identifies the problem, so Rapid can tell it apart from others on the same feature. */
  hash: string;
  /** For a stop with no level: the levels its station's stops use, to pick from. */
  levelOptions?: { levelId: string; label: string }[];
  /** For an outline: its level_id (so it can be refit). */
  levelId?: string;
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
  const { stationOfStop, stationsByLevel } = buildStationIndex(entities);
  const levels = levelsLowestFirst(collectLevels(entities));
  const label = (levelId: string, name: string) => (name && name !== levelId ? `${name} (${levelId})` : levelId);
  const optionsFor = (stationId: string | undefined) => levels
    .filter(level => stationId && stationsByLevel.get(level.levelId)?.has(stationId))
    .map(level => ({ levelId: level.levelId, label: label(level.levelId, level.name) }));

  for (const stop of unleveledStops(entities)) {
    add(stop.id, {
      subtype: 'missing_level',
      message: `This ${typeName(stop)} has no level_id`,
      hash: 'missing_level',
      levelOptions: optionsFor(stationOfStop.get(stop.id))
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

  for (const { stop, levelId, meters } of farStops(entities)) {
    add(stop.id, {
      subtype: 'far_stop',
      message: `This ${typeName(stop)} is ${distanceLabel(meters)} from the rest of level ${levelId}`,
      hash: `far_stop:${levelId}`
    });
  }

  return problems;
}
