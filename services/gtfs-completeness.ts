// Flags GTFS features left incomplete: pathways whose ends aren't stops,
// levels no stop is on, and stations no stop belongs to.
import { buildStationIndex, isLevelArea, isPathway, stopLevelId, stopNodes } from '~/services/pathways-levels';
import type { LevelEntity } from '~/services/pathways-levels';

export type CompletenessSubtype = 'pathway_end' | 'empty_level' | 'empty_station' | 'station_no_stop_id';

export interface CompletenessProblem {
  subtype: CompletenessSubtype;
  message: string;
  /** Other features the problem involves (e.g. a pathway's bare end node). */
  relatedIds: (string | number)[];
  /** Identifies the problem, so Rapid can tell it apart from others on the same feature. */
  hash: string;
}

/** What the checks need to know about the whole workspace, built once per graph. */
export interface CompletenessIndex {
  /** level_ids that some stop is on. */
  stopLevelIds: Set<string>;
  /** stop_id of each station -> how many stops belong to it. */
  stopsPerStation: Map<string, number>;
}

export function buildCompletenessIndex(entities: LevelEntity[]): CompletenessIndex {
  const stopLevelIds = new Set<string>();
  for (const stop of stopNodes(entities)) {
    const levelId = stopLevelId(stop);
    if (levelId) stopLevelIds.add(levelId);
  }
  const stopsPerStation = new Map<string, number>();
  for (const stationId of buildStationIndex(entities).stationOfStop.values()) {
    stopsPerStation.set(stationId, (stopsPerStation.get(stationId) ?? 0) + 1);
  }
  return { stopLevelIds, stopsPerStation };
}

const hasTags = (entity: LevelEntity | undefined) => Object.keys(entity?.tags ?? {}).length > 0;

/**
 * Ways in which a feature is incomplete:
 * - a pathway whose start or end node isn't a stop (it leads nowhere, or
 *   meets other pathways at an untagged node; GTFS pathways connect stops);
 * - a level outline whose level_id no stop is on;
 * - a station with no stop_id (so no stop can name it as its parent_station),
 *   or that no stop names as its parent_station (so it has no stops and no
 *   levels).
 * @param getEntity - looks up a feature by ID (for a pathway's end nodes)
 */
export function completenessProblems(
  entity: LevelEntity,
  getEntity: (id: string | number) => LevelEntity | undefined,
  index: CompletenessIndex
): CompletenessProblem[] {
  const tags = entity.tags ?? {};

  if (isLevelArea(entity)) {
    const levelId = tags.level_id?.trim();
    if (!levelId || index.stopLevelIds.has(levelId)) return [];
    const name = tags.level_name?.trim();
    return [{
      subtype: 'empty_level',
      message: `No stops are on level ${name ? `${name} (${levelId})` : levelId}`,
      relatedIds: [],
      hash: `empty_level:${levelId}`
    }];
  }

  if (isPathway(entity)) {
    const [startId, endId] = [entity.nodes![0]!, entity.nodes!.at(-1)!];
    const bare = [startId, endId].filter(id => !hasTags(getEntity(id)));
    if (!bare.length) return [];
    const message = bare.length === 2
      ? 'Neither end of this pathway is a stop'
      : `This pathway's ${bare[0] === startId ? 'start' : 'end'} isn't a stop`;
    return [{ subtype: 'pathway_end', message, relatedIds: bare, hash: `pathway_end:${bare.join(',')}` }];
  }

  if (entity.type === 'node' && tags.location_type?.trim() === '1') {
    const stopId = tags.stop_id?.trim();
    if (!stopId) {
      return [{
        subtype: 'station_no_stop_id',
        message: 'This station has no stop_id, so no stops can name it as their parent_station',
        relatedIds: [],
        hash: 'station_no_stop_id'
      }];
    }
    if (index.stopsPerStation.get(stopId)) return [];
    const name = tags.stop_name?.trim() || stopId || 'This station';
    return [{
      subtype: 'empty_station',
      message: `${name === 'This station' ? name : `Station ${name}`} has no stops or levels`,
      relatedIds: [],
      hash: `empty_station:${stopId ?? ''}`
    }];
  }

  return [];
}
