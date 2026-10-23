// How TDEI's upload validation (TDEI-python-gtfs-pathways-validation) treats each
// problem the editor finds, so the editor shows the same severity: MobilityData's
// severity for its checks, and TDEI's own (that service's src/custom_checks.py and
// docs/validation-rules.md). Problems GTFS can't have (level outlines, pathway ends
// that aren't stops) are editor-only WARNINGs.
//
// Whether an ERROR fails the upload depends on the service's mode: by default
// (lenient), only errors outside pathways data do; in strict mode, all do.
import type { CompletenessSubtype } from '~/services/gtfs-completeness';
import type { ConnectivitySubtype } from '~/services/gtfs-connectivity';
import type { LevelCheckSubtype } from '~/services/gtfs-level-checks';
import type { ReferenceSubtype } from '~/services/gtfs-references';
import type { RequiredFieldSubtype } from '~/services/gtfs-required-fields';

export type TdeiSeverity = 'ERROR' | 'WARNING' | 'INFO';

/** Matches the service's PATHWAYS_STRICT: whether errors in pathways data fail an upload. */
export const TDEI_STRICT = false;

/** Starts the message of a problem that fails the upload. */
export const FAILS_UPLOAD_LABEL = 'Fails TDEI upload';

/**
 * The Rapid severity and message for a problem, given whether it's in pathways
 * data (see `TDEI_STRICT`). One that fails the upload is a labelled warning rather
 * than a Rapid error, because Rapid won't save an edit with an error on it, and
 * work in progress (e.g. a stop not yet connected) should still save. Any other
 * ERROR or WARNING is a warning; INFO is a suggestion.
 */
export function rapidSeverity(severity: TdeiSeverity, message: string, pathwayData = true): { severity: 'warning' | 'suggestion'; message: string } {
  if (severity === 'ERROR' && (TDEI_STRICT || !pathwayData)) return { severity: 'warning', message: `${FAILS_UPLOAD_LABEL}: ${message}` };
  return { severity: severity === 'INFO' ? 'suggestion' : 'warning', message };
}

/** location_types that are pathways data: entrances, generic nodes and boarding areas. */
const PATHWAY_LOCATION_TYPES = new Set(['2', '3', '4']);

/** Whether a stop is pathways data, so a problem with it doesn't fail an upload in lenient mode. */
export function isPathwayStop(stop: { tags?: Record<string, string> }): boolean {
  return PATHWAY_LOCATION_TYPES.has(stop.tags?.location_type?.trim() ?? '');
}

/** MobilityData: foreign_key_violation, wrong_parent_location_type, location_without_parent_station, duplicate_key. */
export const REFERENCE_SEVERITY: Record<ReferenceSubtype, TdeiSeverity> = {
  parent_station: 'ERROR',
  level_id: 'ERROR',
  stop_id: 'ERROR'
};

/** MobilityData: missing_stop_name, missing_required_field. */
export const REQUIRED_FIELD_SEVERITY: Record<RequiredFieldSubtype, TdeiSeverity> = {
  stop_name: 'ERROR',
  pathway_mode: 'ERROR',
  is_bidirectional: 'ERROR',
  level_index: 'ERROR'
};

export const COMPLETENESS_SEVERITY: Record<CompletenessSubtype, TdeiSeverity> = {
  pathway_end: 'WARNING', // editor only
  empty_level: 'WARNING', // tdei_empty_level
  empty_station: 'INFO', // MobilityData unused_station
  station_no_stop_id: 'WARNING' // editor only
};

export const LEVEL_CHECK_SEVERITY: Record<LevelCheckSubtype, TdeiSeverity> = {
  missing_level: 'WARNING', // tdei_missing_level_id
  level_area_no_id: 'WARNING', // editor only
  large_outline: 'WARNING', // editor only
  far_stop: 'WARNING', // tdei_stop_far_from_level
  station_level_order: 'WARNING', // tdei_level_index_repeated, tdei_level_index_far_from_street
  outside_level: 'WARNING' // editor only
};

/** By subtype. */
export const CONNECTIVITY_SEVERITY: Record<ConnectivitySubtype, TdeiSeverity> = {
  unreachable: 'ERROR', // MobilityData pathway_unreachable_location
  no_way_out: 'ERROR', // MobilityData pathway_unreachable_location
  no_step_free: 'INFO', // tdei_platform_no_step_free_route_in
  elevator_only: 'INFO', // tdei_elevator_only_route
  level_unreachable: 'ERROR', // tdei_level_unreachable
  no_entrance: 'ERROR', // tdei_station_without_entrance
  same_level: 'WARNING', // tdei_level_change_same_level, tdei_stairs_same_level
  exit_gate_two_way: 'ERROR', // MobilityData bidirectional_exit_gate
  isolated: 'WARNING', // tdei_stop_without_pathway
  duplicate_pathway_id: 'ERROR', // MobilityData duplicate_key
  dead_end: 'WARNING', // MobilityData pathway_dangling_generic_node
  duplicate_pathway: 'WARNING', // tdei_duplicate_pathway
  length_too_short: 'WARNING', // tdei_length_too_short
  length_too_long: 'INFO', // tdei_length_too_long
  traversal_time_mismatch: 'WARNING', // tdei_traversal_time_mismatch
  stair_count_direction: 'WARNING', // tdei_stair_count_direction
  walkway_changes_level: 'WARNING', // tdei_walkway_changes_level
  boarding_area_level: 'WARNING', // tdei_boarding_area_level
  pathway_to_station: 'ERROR', // MobilityData pathway_to_wrong_location_type
  pathway_to_platform_with_boarding_areas: 'ERROR', // MobilityData pathway_to_platform_with_boarding_areas
  pathway_loop: 'WARNING', // MobilityData pathway_loop
  pathway_to_street_access_stop: 'ERROR', // MobilityData pathway_to_stop_with_access_outside_of_station_pathways
  elevator_end_no_level: 'ERROR', // MobilityData missing_level_id
  pathway_ends_far_apart: 'WARNING', // tdei_pathway_ends_far_apart
  far_from_station: 'WARNING', // tdei_stop_far_from_station
  stairs_short_within_level: 'INFO', // tdei_stairs_short_within_level
  stops_share_location: 'INFO', // tdei_stops_share_location
  stops_share_position: 'INFO' // tdei_stops_share_position
};
