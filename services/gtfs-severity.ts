// How TDEI's upload validation (TDEI-python-gtfs-pathways-validation) treats each
// problem the editor finds, so the editor shows the same severity. ERROR fails the
// upload: every MobilityData error, and TDEI's own checks marked ERROR in that
// service's src/custom_checks.py. WARNING and INFO don't. Problems GTFS can't have
// (level outlines, pathway ends that aren't stops) are editor-only WARNINGs.
import type { CompletenessSubtype } from '~/services/gtfs-completeness';
import type { ConnectivitySubtype } from '~/services/gtfs-connectivity';
import type { LevelCheckSubtype } from '~/services/gtfs-level-checks';
import type { ReferenceSubtype } from '~/services/gtfs-references';
import type { RequiredFieldSubtype } from '~/services/gtfs-required-fields';

export type TdeiSeverity = 'ERROR' | 'WARNING' | 'INFO';

/** Starts the message of a problem that fails the upload. */
export const FAILS_UPLOAD_LABEL = 'Fails TDEI upload';

/**
 * The Rapid severity and message for a problem. One that fails the upload is a
 * labelled warning rather than a Rapid error, because Rapid won't save an edit
 * with an error on it, and work in progress (e.g. a stop not yet connected)
 * should still save. INFO is a suggestion.
 */
export function rapidSeverity(severity: TdeiSeverity, message: string): { severity: 'warning' | 'suggestion'; message: string } {
  if (severity === 'ERROR') return { severity: 'warning', message: `${FAILS_UPLOAD_LABEL}: ${message}` };
  return { severity: severity === 'INFO' ? 'suggestion' : 'warning', message };
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
  far_stop: 'INFO', // tdei_stop_far_from_level
  station_level_order: 'WARNING', // tdei_level_index_repeated, tdei_level_index_far_from_street
  outside_level: 'WARNING' // editor only
};

/** By subtype; same_level depends on the pathway (see `sameLevelSeverity`). */
export const CONNECTIVITY_SEVERITY: Record<ConnectivitySubtype, TdeiSeverity> = {
  unreachable: 'ERROR', // MobilityData pathway_unreachable_location
  no_way_out: 'ERROR', // MobilityData pathway_unreachable_location
  no_step_free: 'WARNING', // tdei_platform_no_step_free_route_in
  elevator_only: 'INFO', // tdei_elevator_only_route
  level_unreachable: 'ERROR', // tdei_level_unreachable
  no_entrance: 'ERROR', // tdei_station_without_entrance
  same_level: 'ERROR', // tdei_level_change_same_level
  exit_gate_two_way: 'ERROR', // MobilityData bidirectional_exit_gate
  escalator_two_way: 'WARNING', // tdei_escalator_two_way
  isolated: 'ERROR', // tdei_stop_without_pathway
  duplicate_pathway_id: 'ERROR', // MobilityData duplicate_key
  dead_end: 'WARNING', // MobilityData pathway_dangling_generic_node
  duplicate_pathway: 'WARNING', // tdei_duplicate_pathway
  length_mismatch: 'INFO', // tdei_length_mismatch
  traversal_time_mismatch: 'WARNING', // tdei_traversal_time_mismatch
  stair_count_direction: 'ERROR', // tdei_stair_count_direction
  walkway_changes_level: 'WARNING', // tdei_walkway_changes_level
  boarding_area_level: 'WARNING', // tdei_boarding_area_level
  pathway_to_station: 'ERROR', // MobilityData pathway_to_wrong_location_type
  pathway_to_platform_with_boarding_areas: 'ERROR', // MobilityData pathway_to_platform_with_boarding_areas
  pathway_loop: 'WARNING', // MobilityData pathway_loop
  pathway_to_street_access_stop: 'ERROR', // MobilityData pathway_to_stop_with_access_outside_of_station_pathways
  elevator_end_no_level: 'ERROR', // MobilityData missing_level_id
  pathway_ends_far_apart: 'WARNING', // tdei_pathway_ends_far_apart
  far_from_station: 'WARNING' // tdei_stop_far_from_station
};

/** Escalators and elevators on one level fail the upload; stairs (often a few steps within a level) don't (tdei_stairs_same_level). */
export function sameLevelSeverity(pathwayMode: string): TdeiSeverity {
  return pathwayMode === '2' ? 'WARNING' : 'ERROR';
}
