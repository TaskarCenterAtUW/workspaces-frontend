// Checks how each station's stops connect through pathways: whether riders
// can get from an entrance to each platform and back, whether there's a
// step-free route, stops no pathway touches, and pathway settings that are
// likely mistakes (including pathway_ids used twice; stop_ids used twice are
// flagged with the other references, in gtfs-references.ts).
import { TYPE_NAMES } from '~/services/gtfs-references';
import { buildStationIndex, collectLevels, distanceMeters, isPathway, stopLevelId } from '~/services/pathways-levels';
import type { LevelEntity } from '~/services/pathways-levels';

export type ConnectivitySubtype
  = | 'unreachable' | 'no_way_out' | 'no_step_free' | 'elevator_only'
    | 'level_unreachable' | 'no_entrance'
    | 'same_level' | 'exit_gate_two_way' | 'escalator_two_way'
    | 'isolated' | 'duplicate_pathway_id'
    | 'dead_end' | 'duplicate_pathway' | 'length_mismatch' | 'traversal_time_mismatch'
    | 'stair_count_direction' | 'walkway_changes_level' | 'boarding_area_level';

export interface ConnectivityProblem {
  subtype: ConnectivitySubtype;
  /** 'warning' for likely mistakes; 'suggestion' for accessibility gaps a station may really have. */
  severity: 'warning' | 'suggestion';
  message: string;
  /** Identifies the problem, so Rapid can tell it apart from others on the same feature. */
  hash: string;
}

/** pathway_mode values that aren't step-free (stairs, escalator). */
const STEPPED_MODES = new Set(['2', '4']);
const ELEVATOR_MODE = '5';
/** pathway_modes whose ends should be on different levels: stairs, escalator, elevator. */
const LEVEL_CHANGING_MODES: Record<string, string> = { 2: 'stairs', 4: 'escalator', 5: 'elevator' };
/** pathway_modes drawn at their real length (not stairs, escalators or elevators, which slope or rise). */
const FLAT_MODES = new Set(['1', '3', '6', '7']);
/** pathway_modes whose traversal_time is checked against the drawn length: moving sidewalk, escalator. */
const TIMED_MODES = new Set(['3', '4']);
/** A tagged length is flagged when it's outside these multiples of the drawn length, and this far off. */
const LENGTH_RATIO = { min: 0.5, max: 2 };
const LENGTH_SLACK_METERS = 10;
/** Plausible speeds, in m/s, for a traversal_time over the drawn length. */
const SPEED_RANGE = { min: 0.1, max: 5 };

/** location_types riders board from: platforms (also stops with no location_type) and boarding areas. */
const BOARDING_TYPES = new Set(['', '0', '4']);

interface Edge {
  to: string | number;
  mode: string;
}

/**
 * Finds every connectivity problem in the workspace, by feature ID: the
 * checks span whole stations, so they're found together. A pathway goes from
 * its first node to its last, and back too unless is_bidirectional is 0.
 */
export function connectivityProblems(entities: LevelEntity[]): Map<string | number, ConnectivityProblem[]> {
  const problems = new Map<string | number, ConnectivityProblem[]>();
  const add = (id: string | number, problem: Omit<ConnectivityProblem, 'hash'>) =>
    problems.set(id, [...(problems.get(id) ?? []), { ...problem, hash: problem.subtype }]);

  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const forward = new Map<string | number, Edge[]>();
  const backward = new Map<string | number, Edge[]>();
  const link = (from: string | number, to: string | number, mode: string) => {
    forward.set(from, [...(forward.get(from) ?? []), { to, mode }]);
    backward.set(to, [...(backward.get(to) ?? []), { to: from, mode }]);
  };

  for (const way of entities.filter(isPathway)) {
    const mode = way.tags?.pathway_mode?.trim() ?? '';
    const twoWay = way.tags?.is_bidirectional?.trim() !== '0';
    const [from, to] = [way.nodes![0]!, way.nodes!.at(-1)!];
    link(from, to, mode);
    if (twoWay) link(to, from, mode);

    // Settings that are likely mistakes.
    if (mode === '7' && twoWay) {
      add(way.id, { subtype: 'exit_gate_two_way', severity: 'warning', message: 'An exit gate should be one-way (is_bidirectional 0)' });
    }
    if (mode === '4' && way.tags?.is_bidirectional?.trim() === '1') {
      add(way.id, { subtype: 'escalator_two_way', severity: 'suggestion', message: 'This escalator is marked two-way; most run one way' });
    }
    const kind = LEVEL_CHANGING_MODES[mode];
    const [fromLevel, toLevel] = [byId.get(from), byId.get(to)].map(end => (end ? stopLevelId(end) : undefined));
    if (kind && fromLevel && fromLevel === toLevel) {
      add(way.id, { subtype: 'same_level', severity: 'warning', message: `This ${kind} starts and ends on the same level (${fromLevel})` });
    }
  }

  // Pathway details that don't fit the drawing or the levels.
  const levelIndex = new Map(collectLevels(entities)
    .filter(level => level.index !== undefined)
    .map(level => [level.levelId, level.index!]));
  const locOf = (id: string | number) => (byId.get(id) as { loc?: [number, number] } | undefined)?.loc;
  const pairs = new Map<string, (string | number)[]>();
  for (const way of entities.filter(isPathway)) {
    const tags = way.tags ?? {};
    const mode = tags.pathway_mode?.trim() ?? '';
    const [from, to] = [way.nodes![0]!, way.nodes!.at(-1)!];

    // The same two stops joined twice the same way (same type, same direction).
    const twoWay = tags.is_bidirectional?.trim() !== '0';
    const key = `${mode}|${twoWay ? [String(from), String(to)].sort().join('|') : `${from}>${to}`}`;
    pairs.set(key, [...(pairs.get(key) ?? []), way.id]);

    const locs = way.nodes!.map(locOf);
    const drawn = locs.every(Boolean)
      ? locs.slice(1).reduce((sum, loc, i) => sum + distanceMeters(locs[i]!, loc!), 0)
      : undefined;
    const length = Number(tags.length);
    if (drawn && FLAT_MODES.has(mode) && tags.length?.trim() && Number.isFinite(length)
      && (length < drawn * LENGTH_RATIO.min || length > drawn * LENGTH_RATIO.max)
      && Math.abs(length - drawn) >= LENGTH_SLACK_METERS) {
      add(way.id, {
        subtype: 'length_mismatch',
        severity: 'suggestion',
        message: `length is ${length} m, but this pathway is drawn about ${Math.round(drawn)} m long`
      });
    }
    const time = Number(tags.traversal_time);
    if (drawn && TIMED_MODES.has(mode) && tags.traversal_time?.trim() && time > 0) {
      const speed = drawn / time;
      if (speed < SPEED_RANGE.min || speed > SPEED_RANGE.max) {
        add(way.id, {
          subtype: 'traversal_time_mismatch',
          severity: 'suggestion',
          message: `traversal_time is ${time} s for about ${Math.round(drawn)} m, ${speed < SPEED_RANGE.min ? 'very slow' : 'very fast'}`
        });
      }
    }

    const [fromLevel, toLevel] = [byId.get(from), byId.get(to)].map(end => (end ? stopLevelId(end) : undefined));
    const [fromIndex, toIndex] = [fromLevel, toLevel].map(id => (id ? levelIndex.get(id) : undefined));
    const stairs = Number(tags.stair_count);
    if (mode === '2' && tags.stair_count?.trim() && stairs !== 0 && Number.isFinite(stairs)
      && fromIndex !== undefined && toIndex !== undefined && fromIndex !== toIndex
      && (stairs > 0) !== (toIndex > fromIndex)) {
      add(way.id, {
        subtype: 'stair_count_direction',
        severity: 'warning',
        message: `stair_count is ${stairs}, but these stairs go ${toIndex > fromIndex ? 'up' : 'down'} from ${fromLevel} to ${toLevel}`
      });
    }
    if (FLAT_MODES.has(mode) && fromLevel && toLevel && fromLevel !== toLevel && !tags.max_slope?.trim()) {
      add(way.id, {
        subtype: 'walkway_changes_level',
        severity: 'suggestion',
        message: `This pathway joins two levels (${fromLevel} and ${toLevel}) without stairs, an escalator or an elevator`
      });
    }
  }
  for (const ids of pairs.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      add(id, { subtype: 'duplicate_pathway', severity: 'warning', message: 'Another pathway of the same type joins the same two stops' });
    }
  }

  // Generic nodes only one pathway touches: dead ends.
  const touching = new Map<string | number, number>();
  for (const way of entities.filter(isPathway)) {
    for (const end of new Set([way.nodes![0]!, way.nodes!.at(-1)!])) touching.set(end, (touching.get(end) ?? 0) + 1);
  }
  for (const [id, count] of touching) {
    if (count === 1 && byId.get(id)?.tags?.location_type?.trim() === '3') {
      add(id, { subtype: 'dead_end', severity: 'warning', message: 'This generic node is a dead end: only one pathway reaches it' });
    }
  }

  // Boarding areas on a different level from their platform.
  const byStopId = new Map<string, LevelEntity>();
  for (const entity of entities) {
    const stopId = entity.type === 'node' ? entity.tags?.stop_id?.trim() : undefined;
    if (stopId && !byStopId.has(stopId)) byStopId.set(stopId, entity);
  }
  for (const area of entities) {
    if (area.type !== 'node' || area.tags?.location_type?.trim() !== '4') continue;
    const platform = byStopId.get(area.tags.parent_station?.trim() ?? '');
    const [areaLevel, platformLevel] = [stopLevelId(area), platform ? stopLevelId(platform) : undefined];
    if (areaLevel && platformLevel && areaLevel !== platformLevel) {
      add(area.id, {
        subtype: 'boarding_area_level',
        severity: 'warning',
        message: `This boarding area is on level ${areaLevel}, but its platform is on ${platformLevel}`
      });
    }
  }

  // pathway_ids used by more than one pathway.
  const pathwaysById = new Map<string, (string | number)[]>();
  for (const way of entities.filter(isPathway)) {
    const pathwayId = way.tags?.pathway_id?.trim();
    if (pathwayId) pathwaysById.set(pathwayId, [...(pathwaysById.get(pathwayId) ?? []), way.id]);
  }
  for (const [pathwayId, ids] of pathwaysById) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      add(id, {
        subtype: 'duplicate_pathway_id',
        severity: 'warning',
        message: `pathway_id "${pathwayId}" is also used by ${ids.length === 2 ? 'another pathway' : `${ids.length - 1} other pathways`}`
      });
    }
  }

  // Stops no pathway touches (stations aren't pathway ends in GTFS).
  const isolated = new Set<string | number>();
  for (const stop of entities) {
    if (stop.type !== 'node' || !Object.keys(stop.tags ?? {}).length) continue;
    const type = stop.tags!.location_type?.trim() ?? '';
    if (type === '1' || forward.has(stop.id) || backward.has(stop.id)) continue;
    isolated.add(stop.id);
    add(stop.id, { subtype: 'isolated', severity: 'warning', message: `This ${TYPE_NAMES[type] ?? 'stop'} isn't connected to any pathway` });
  }

  /** Every stop reachable from `starts` along `edges`, skipping pathways `skip` rejects. */
  const reach = (starts: (string | number)[], edges: Map<string | number, Edge[]>, skip?: (mode: string) => boolean) => {
    const seen = new Set(starts);
    const queue = [...starts];
    while (queue.length) {
      for (const edge of edges.get(queue.shift()!) ?? []) {
        if (seen.has(edge.to) || skip?.(edge.mode)) continue;
        seen.add(edge.to);
        queue.push(edge.to);
      }
    }
    return seen;
  };

  const { stations, stationOfStop } = buildStationIndex(entities);
  const members = new Map<string, LevelEntity[]>();
  for (const [stopId, stationId] of stationOfStop) {
    const stop = byId.get(stopId);
    if (stop) members.set(stationId, [...(members.get(stationId) ?? []), stop]);
  }

  const reachableLevels = new Set<string>();
  const unreachedLevels = new Map<string, string>(); // level_id -> a station whose entrances don't reach it
  for (const station of stations.values()) {
    const stops = members.get(station.stopId) ?? [];
    if (!stops.length) continue; // an empty station is flagged elsewhere
    const type = (stop: LevelEntity) => stop.tags?.location_type?.trim() ?? '';
    const entrances = stops.filter(stop => type(stop) === '2').map(stop => stop.id);
    if (!entrances.length) {
      add(station.id, { subtype: 'no_entrance', severity: 'warning', message: `Station ${station.name} has no entrances` });
      continue;
    }

    const reachable = reach(entrances, forward);
    const canLeave = reach(entrances, backward);
    const stepFree = reach(entrances, forward, mode => STEPPED_MODES.has(mode));
    const withoutElevators = reach(entrances, forward, mode => mode === ELEVATOR_MODE);

    for (const stop of stops.filter(stop => BOARDING_TYPES.has(type(stop)))) {
      const what = type(stop) === '4' ? 'boarding area' : 'platform';
      if (isolated.has(stop.id)) continue; // already flagged as not connected
      if (!reachable.has(stop.id)) {
        add(stop.id, { subtype: 'unreachable', severity: 'warning', message: `This ${what} can't be reached from any of ${station.name}'s entrances` });
        continue;
      }
      if (!canLeave.has(stop.id)) {
        add(stop.id, { subtype: 'no_way_out', severity: 'warning', message: `There's no way from this ${what} back to an entrance (check one-way pathways)` });
      }
      if (!stepFree.has(stop.id)) {
        add(stop.id, { subtype: 'no_step_free', severity: 'suggestion', message: `This ${what} can only be reached by stairs or escalators` });
      } else if (!withoutElevators.has(stop.id)) {
        add(stop.id, { subtype: 'elevator_only', severity: 'suggestion', message: `This ${what} can only be reached by elevator` });
      }
    }

    for (const stop of stops) {
      const levelId = stopLevelId(stop);
      if (!levelId) continue;
      if (reachable.has(stop.id)) reachableLevels.add(levelId);
      else if (!unreachedLevels.has(levelId)) unreachedLevels.set(levelId, station.name);
    }
  }

  // A level is flagged only if no station's entrances reach any stop on it.
  for (const area of entities) {
    const levelId = area.type === 'way' && area.tags?.level_index !== undefined ? area.tags?.level_id?.trim() : undefined;
    if (!levelId || reachableLevels.has(levelId) || !unreachedLevels.has(levelId)) continue;
    add(area.id, {
      subtype: 'level_unreachable',
      severity: 'warning',
      message: `No stop on level ${levelId} can be reached from ${unreachedLevels.get(levelId)}'s entrances`
    });
  }

  return problems;
}
