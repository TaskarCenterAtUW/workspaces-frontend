// Generated GTFS IDs, following the pattern the workspaces' imported feeds use
// (e.g. WMATA): everything is named after its station's code (N06, or D03_F03
// for a combined station), which is the station's stop_id without "STN_".
// - stations: STN_<code> (see `stationStopIdBase`)
// - stops: <type prefix>_<code>_<n>, e.g. PF_N06_1, ENT_N06_2, NODE_N06_3
// - pathways: <code>_<n>, numbered on from the highest pathway number in use
// - levels: <code>_L<n> (see `suggestLevelId`)
// Stops and pathways with no station get no pattern ID (the caller falls back).
import { buildStationIndex, stationCode, stationStopIdBase } from '~/services/pathways-levels';
import type { LevelEntity } from '~/services/pathways-levels';

/** stop_id prefixes by location_type: platform, entrance, generic node, boarding area. */
export const STOP_ID_PREFIXES: Record<string, string> = { '': 'PF', '0': 'PF', '2': 'ENT', '3': 'NODE', '4': 'BA' };

/** The first `<base>_<n>` (n = 1, 2, ...) not in `used`. */
export function numberedId(base: string, used: Set<string>): string {
  for (let n = 1; ; n++) {
    const id = `${base}_${n}`;
    if (!used.has(id)) return id;
  }
}

/** `base`, or `<base>_2`, `<base>_3`, ... if it's in `used`. */
function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
  return id;
}

/**
 * Makes stop_ids for stops that need one: a station gets STN_<code> (from its
 * stop_code or name), other stops their type's prefix, station code and the
 * next free number. Undefined for a stop with no station (or an unknown type).
 * The caller adds each returned ID to `used`.
 */
export function stopIdGenerator(entities: LevelEntity[]) {
  const { stationOfStop } = buildStationIndex(entities);
  return (stop: LevelEntity, used: Set<string>): string | undefined => {
    const type = stop.tags?.location_type?.trim() ?? '';
    if (type === '1') return uniqueId(stationStopIdBase(stop.tags), used);
    const stationId = stationOfStop.get(stop.id);
    const prefix = STOP_ID_PREFIXES[type];
    return stationId && prefix ? numberedId(`${prefix}_${stationCode(stationId)}`, used) : undefined;
  };
}

/**
 * Makes pathway_ids: the station code of the pathway's start stop (or end
 * stop), then a number counting on from the highest one any pathway_id ends
 * in. Undefined for a pathway whose ends aren't in a station.
 */
export function pathwayIdGenerator(entities: LevelEntity[]) {
  const { stationOfStop } = buildStationIndex(entities);
  let next = 1;
  for (const entity of entities) {
    const match = entity.type === 'way' ? /_(\d+)$/.exec(entity.tags?.pathway_id?.trim() ?? '') : null;
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  return (way: LevelEntity, used: Set<string>): string | undefined => {
    const stationId = stationOfStop.get(way.nodes?.[0] ?? '') ?? stationOfStop.get(way.nodes?.at(-1) ?? '');
    if (!stationId) return undefined;
    let id: string;
    do id = `${stationCode(stationId)}_${next++}`; while (used.has(id));
    return id;
  };
}
