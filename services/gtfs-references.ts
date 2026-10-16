// Checks that GTFS references between stops resolve: parent_station to a
// stop of the right kind, level_id to a defined level, and stop_id to exactly
// one stop. Editor-agnostic (plain { id, type, tags } entities); Rapid 3 shows
// the results as validation issues (services/rapid3-validation.ts).

import { isLevelArea, stopLevelId, stopNodes } from '~/services/pathways-levels';
import type { LevelEntity } from '~/services/pathways-levels';

export interface ReferenceIndex {
  /** stop_id -> the stops (nodes) that have it; more than one is a duplicate. */
  stopsByStopId: Map<string, LevelEntity[]>;
  /** level_ids defined by level outlines. */
  levelIds: Set<string>;
}

export type ReferenceSubtype = 'parent_station' | 'level_id' | 'stop_id';

export interface ReferenceProblem {
  subtype: ReferenceSubtype;
  message: string;
  /** Other entities involved, e.g. the other stops sharing a stop_id. */
  relatedIds: (string | number)[];
  /** Tells apart problems of one subtype on one entity. */
  hash: string;
}

const TYPE_NAMES: Record<string, string> = {
  '': 'stop',
  '0': 'platform',
  '1': 'station',
  '2': 'entrance',
  '3': 'generic node',
  '4': 'boarding area'
};

/** location_type -> the location_type its parent_station must have, for types where GTFS requires one. */
const REQUIRED_PARENT_TYPE: Record<string, string> = { 2: '1', 3: '1', 4: '0' };

const locationType = (entity: LevelEntity) => {
  const type = entity.tags?.location_type?.trim() ?? '';
  return type === '' ? '0' : type; // empty means 0 (stop / platform)
};

/** location_types that other stops point at with parent_station: stations, and platforms (for boarding areas). */
const PARENT_TYPES = new Set(['0', '1']);

/**
 * stop_ids to give stations and platforms that don't have one yet, so they can
 * be chosen as a parent_station: their stop_name in upper snake case (e.g.
 * "Central Station" -> CENTRAL_STATION), or STATION / PLATFORM, made unique
 * with a numeric suffix. Deterministic for the same data, so the editor and the
 * reference checks agree on them before they're written.
 * @returns entity ID -> suggested stop_id
 */
export function suggestedStopIds(entities: LevelEntity[]): Map<string | number, string> {
  const stops = stopNodes(entities);
  const taken = new Set(stops.map(stop => stop.tags?.stop_id?.trim()).filter(Boolean) as string[]);
  const suggestions = new Map<string | number, string>();

  const needIds = stops
    .filter(stop => !stop.tags?.stop_id?.trim() && PARENT_TYPES.has(locationType(stop)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  for (const stop of needIds) {
    const fromName = (stop.tags?.stop_name ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const base = fromName || (locationType(stop) === '1' ? 'STATION' : 'PLATFORM');
    let candidate = base;
    for (let n = 2; taken.has(candidate); n++) candidate = `${base}_${n}`;
    taken.add(candidate);
    suggestions.set(stop.id, candidate);
  }
  return suggestions;
}

export function buildReferenceIndex(entities: LevelEntity[]): ReferenceIndex {
  const stopsByStopId = new Map<string, LevelEntity[]>();
  for (const stop of stopNodes(entities)) {
    const stopId = stop.tags?.stop_id?.trim();
    if (stopId) stopsByStopId.set(stopId, [...(stopsByStopId.get(stopId) ?? []), stop]);
  }
  // A parent_station may name a station's suggested stop_id just before the
  // editor writes it onto the station (see Rapid3LevelTools), so count those.
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  for (const [id, stopId] of suggestedStopIds(entities)) {
    if (!stopsByStopId.has(stopId)) stopsByStopId.set(stopId, [byId.get(id)!]);
  }

  const levelIds = new Set<string>();
  for (const area of entities.filter(isLevelArea)) {
    const levelId = area.tags!.level_id?.trim();
    if (levelId) levelIds.add(levelId);
  }

  return { stopsByStopId, levelIds };
}

/** The reference problems of one feature (only tagged nodes, i.e. stops, have any). */
export function referenceProblems(entity: LevelEntity, index: ReferenceIndex): ReferenceProblem[] {
  const tags = entity.tags ?? {};
  if (entity.type !== 'node' || !Object.keys(tags).length) return [];

  const problems: ReferenceProblem[] = [];
  const type = locationType(entity);
  const typeName = TYPE_NAMES[type] ?? 'stop';
  const parent = tags.parent_station?.trim();

  // parent_station: forbidden for stations; otherwise it must name a station
  // (or, for a boarding area, a platform), and is required for some types.
  if (type === '1') {
    if (parent) {
      problems.push({
        subtype: 'parent_station',
        message: `Stations can't have a parent_station (this one has "${parent}")`,
        relatedIds: [],
        hash: `forbidden:${parent}`
      });
    }
  } else if (parent) {
    const expected = type === '4' ? '0' : '1';
    const matches = index.stopsByStopId.get(parent) ?? [];
    if (!matches.length) {
      problems.push({
        subtype: 'parent_station',
        message: `parent_station "${parent}" doesn't match any stop's stop_id`,
        relatedIds: [],
        hash: `unknown:${parent}`
      });
    } else if (!matches.some(match => locationType(match) === expected)) {
      problems.push({
        subtype: 'parent_station',
        message: `This ${typeName}'s parent_station "${parent}" should be a ${TYPE_NAMES[expected]}, `
          + `but it's a ${TYPE_NAMES[locationType(matches[0]!)] ?? 'stop'}`,
        relatedIds: matches.map(match => match.id),
        hash: `wrong-type:${parent}`
      });
    }
  } else if (REQUIRED_PARENT_TYPE[type]) {
    problems.push({
      subtype: 'parent_station',
      message: `This ${typeName} needs a parent_station: the stop_id of its ${TYPE_NAMES[REQUIRED_PARENT_TYPE[type]!]}`,
      relatedIds: [],
      hash: 'missing'
    });
  }

  // level_id: must be a level drawn in the workspace.
  const levelId = stopLevelId(entity);
  if (levelId && !index.levelIds.has(levelId)) {
    problems.push({
      subtype: 'level_id',
      message: `level_id "${levelId}" doesn't match any level outline in this workspace`,
      relatedIds: [],
      hash: `unknown:${levelId}`
    });
  }

  // stop_id: must identify exactly one stop.
  const stopId = tags.stop_id?.trim();
  const others = stopId ? (index.stopsByStopId.get(stopId) ?? []).filter(stop => stop.id !== entity.id) : [];
  if (others.length) {
    problems.push({
      subtype: 'stop_id',
      message: `stop_id "${stopId}" is also used by ${others.length === 1 ? 'another stop' : `${others.length} other stops`}`,
      relatedIds: others.map(stop => stop.id),
      hash: `duplicate:${stopId}`
    });
  }

  return problems;
}
