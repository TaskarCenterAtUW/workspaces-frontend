// Checks that stops, pathways and levels have the fields GTFS requires that
// the export can't fill in. IDs (stop_id, pathway_id, level_id) aren't
// checked: the export generates any that are missing (see services/pathways.ts),
// and a pathway's from/to stops are its end nodes. parent_station is checked
// with the other references (see gtfs-references.ts).
import { TYPE_NAMES } from '~/services/gtfs-references';
import { isLevelArea, isPathway } from '~/services/pathways-levels';
import type { LevelEntity } from '~/services/pathways-levels';

export type RequiredFieldSubtype = 'stop_name' | 'pathway_mode' | 'is_bidirectional' | 'level_index';

export interface RequiredFieldProblem {
  subtype: RequiredFieldSubtype;
  message: string;
  /** Identifies the problem, so Rapid can tell it apart from others on the same feature. */
  hash: string;
}

/** location_types whose stops GTFS requires a stop_name for (stops/platforms, stations, entrances). */
const NAMED_TYPES = new Set(['', '0', '1', '2']);

const isBlank = (value: string | undefined) => !value?.trim();

/** The required GTFS fields a stop, pathway or level outline is missing. */
export function requiredFieldProblems(entity: LevelEntity): RequiredFieldProblem[] {
  const tags = entity.tags ?? {};
  const problems: RequiredFieldProblem[] = [];
  const missing = (subtype: RequiredFieldSubtype, message: string) =>
    problems.push({ subtype, message, hash: `missing:${subtype}` });

  if (entity.type === 'node') {
    if (!Object.keys(tags).length) return problems; // a pathway bend or outline corner, not a stop
    const type = tags.location_type?.trim() ?? '';
    if (NAMED_TYPES.has(type) && isBlank(tags.stop_name)) {
      missing('stop_name', `This ${TYPE_NAMES[type]} needs a stop_name`);
    }
    return problems;
  }

  if (isLevelArea(entity)) {
    if (isBlank(tags.level_index)) missing('level_index', 'This level needs a level_index');
    return problems;
  }

  if (isPathway(entity)) {
    if (isBlank(tags.pathway_mode)) missing('pathway_mode', 'This pathway needs a pathway_mode');
    if (isBlank(tags.is_bidirectional)) missing('is_bidirectional', 'This pathway needs is_bidirectional');
  }
  return problems;
}
