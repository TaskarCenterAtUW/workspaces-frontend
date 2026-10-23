import { buildReferenceIndex, referenceProblems } from '~/services/gtfs-references';
import { buildCompletenessIndex, completenessProblems } from '~/services/gtfs-completeness';
import { connectivityProblems } from '~/services/gtfs-connectivity';
import { levelProblems } from '~/services/gtfs-level-checks';
import type { LevelProblem } from '~/services/gtfs-level-checks';
import type { Rapid3LevelTools } from '~/services/rapid3-levels';
import type { ConnectivityProblem } from '~/services/gtfs-connectivity';
import { requiredFieldProblems } from '~/services/gtfs-required-fields';
import type { CompletenessIndex } from '~/services/gtfs-completeness';
import { graphEntities } from '~/services/rapid3-levels';
import type { ReferenceIndex } from '~/services/gtfs-references';
import {
  COMPLETENESS_SEVERITY,
  LEVEL_CHECK_SEVERITY,
  rapidSeverity,
  REFERENCE_SEVERITY,
  REQUIRED_FIELD_SEVERITY
} from '~/services/gtfs-severity';
import type { TdeiSeverity } from '~/services/gtfs-severity';

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any;

/**
 * Identifies what's in a graph. Rapid merges newly loaded data into the base
 * graph in place, without changing its key, so the counts of entities are
 * included: loading only ever adds, so they change whenever more arrives.
 */
export function graphStamp(graph: any): string {
  return `${graph?.key ?? ''}|${graph?.base?.entities?.size ?? 0}|${graph?.local?.entities?.size ?? 0}`;
}

/**
 * Caches `build(graph)` for each graph, rebuilding it when the graph's
 * contents change (see `graphStamp`), e.g. as the workspace loads.
 */
export function perGraph<T>(build: (graph: any) => T): (graph: any) => T {
  const cache = new WeakMap<object, { stamp: string; value: T }>();
  return (graph: any) => {
    const stamp = graphStamp(graph);
    const cached = cache.get(graph);
    if (cached?.stamp === stamp) return cached.value;
    const value = build(graph);
    cache.set(graph, { stamp, value });
    return value;
  };
}

/**
 * A Rapid issue's severity and message, for a problem TDEI's upload validation
 * treats as `severity`: problems that fail the upload are labelled warnings
 * (see `rapidSeverity`).
 */
export function issueSeverity(severity: TdeiSeverity, message: string): { severity: 'warning' | 'suggestion'; message: () => string } {
  const shown = rapidSeverity(severity, message);
  return { severity: shown.severity, message: () => shown.message };
}

/** Rapid validator ID for GTFS reference checks (also its key in Rapid's issue strings). */
export const REFERENCE_VALIDATOR_ID = 'gtfs_references';

/** Strings Rapid's Issues panel looks up for the validator (`issues.<id>.title` / `.tip`). */
export const REFERENCE_VALIDATOR_STRINGS = {
  title: 'GTFS references',
  tip: 'Find parent_station, level_id and stop_id values that don\'t match a defined station, level or stop'
};

/**
 * Adds a validator to Rapid 3 that flags stops whose GTFS references don't
 * resolve (see `referenceProblems`): parent_station not naming a station (or,
 * for boarding areas, a platform), level_id not naming a drawn level, and
 * stop_id shared by several stops. Issues appear in Rapid's Issues panel and
 * on the selected feature, with TDEI's severity (see gtfs-severity.ts).
 *
 * Rapid creates its validators at init and keeps them in a map, so this adds
 * one to that map; call it after `initAsync`.
 */
export function installReferenceValidator(context: any, getTools?: () => Rapid3LevelTools | undefined) {
  const validation = context.systems.validator; // Rapid 3's ValidationSystem
  if (!validation?._validators || validation._validators.has(REFERENCE_VALIDATOR_ID)) return;

  // The checks need every stop and level, so index each graph once (per load).
  const indexFor = perGraph((graph): ReferenceIndex => buildReferenceIndex(graphEntities(graph)));

  const validator = (entity: any, graph: any) => ({
    issues: referenceProblems(entity, indexFor(graph)).map(problem => new Rapid.ValidationIssue(context, {
      type: REFERENCE_VALIDATOR_ID,
      subtype: problem.subtype,
      ...issueSeverity(REFERENCE_SEVERITY[problem.subtype], problem.message),
      reference: ($selection: any) => {
        $selection.selectAll('.issue-reference')
          .data([0])
          .enter()
          .append('div')
          .attr('class', 'issue-reference')
          .text(REFERENCE_HELP[problem.subtype]);
      },
      entityIds: [entity.id, ...problem.relatedIds],
      hash: problem.hash,
      // A level_id with no outline: offer to outline that level around its stops.
      dynamicFixes: () => {
        const levelId = entity.tags?.level_id?.trim();
        if (problem.subtype !== 'level_id' || !levelId || !getTools?.()) return [];
        return [new Rapid.ValidationFix({
          title: `Outline level ${levelId} around its stops`,
          onClick: () => getTools()?.outlineLevels([levelId])
        })];
      }
    }))
  });
  validator.type = REFERENCE_VALIDATOR_ID;

  validation._validators.set(REFERENCE_VALIDATOR_ID, validator);
}

/** Help shown under an issue, by subtype. */
export const REFERENCE_HELP: Record<string, string> = {
  parent_station: 'In GTFS, parent_station is the stop_id of the station a stop belongs to '
    + '(for a boarding area, of its platform). Stations can\'t have one; entrances, '
    + 'generic nodes and boarding areas must.',
  level_id: 'In GTFS, level_id must match a level in levels.txt. Outline the level '
    + '("Outline all" in the Stations panel\'s warnings), or fix the level_id.',
  stop_id: 'In GTFS, each stop_id must be unique, so that parent_station and pathways '
    + 'can refer to exactly one stop.'
};

/** Rapid validator ID for GTFS required-field checks (also its key in Rapid's issue strings). */
export const REQUIRED_FIELDS_VALIDATOR_ID = 'gtfs_required_fields';

/** Strings Rapid's Issues panel looks up for the validator (`issues.<id>.title` / `.tip`). */
export const REQUIRED_FIELDS_VALIDATOR_STRINGS = {
  title: 'GTFS required fields',
  tip: 'Find stops, pathways and levels missing a field GTFS requires'
};

/**
 * Adds a validator to Rapid 3 that flags stops, pathways and level outlines
 * missing a field GTFS requires (see `requiredFieldProblems`). Issues appear
 * on the selected feature's form and in Rapid's Issues panel, with TDEI's
 * severity (see gtfs-severity.ts). Call it after `initAsync`.
 */
export function installRequiredFieldsValidator(context: any) {
  const validation = context.systems.validator; // Rapid 3's ValidationSystem
  if (!validation?._validators || validation._validators.has(REQUIRED_FIELDS_VALIDATOR_ID)) return;

  const validator = (entity: any) => ({
    issues: requiredFieldProblems(entity).map(problem => new Rapid.ValidationIssue(context, {
      type: REQUIRED_FIELDS_VALIDATOR_ID,
      subtype: problem.subtype,
      ...issueSeverity(REQUIRED_FIELD_SEVERITY[problem.subtype], problem.message),
      reference: ($selection: any) => {
        $selection.selectAll('.issue-reference')
          .data([0])
          .enter()
          .append('div')
          .attr('class', 'issue-reference')
          .text(REQUIRED_FIELDS_HELP[problem.subtype]);
      },
      entityIds: [entity.id],
      hash: problem.hash
    }))
  });
  validator.type = REQUIRED_FIELDS_VALIDATOR_ID;

  validation._validators.set(REQUIRED_FIELDS_VALIDATOR_ID, validator);
}

/** Help shown under a required-field issue, by subtype. */
export const REQUIRED_FIELDS_HELP: Record<string, string> = {
  stop_name: 'In GTFS, stops, platforms, stations and entrances must have a stop_name (it\'s optional '
    + 'for generic nodes and boarding areas).',
  pathway_mode: 'In GTFS, every pathway needs a pathway_mode: pick a pathway type such as Walkway or Stairs.',
  is_bidirectional: 'In GTFS, every pathway needs is_bidirectional: 1 if it can be used both ways, '
    + '0 if only from its first node to its last.',
  level_index: 'In GTFS, every level needs a level_index: 0 for the ground level, positive above it, '
    + 'negative below.'
};

/** Rapid validator ID for incomplete GTFS features (also its key in Rapid's issue strings). */
export const COMPLETENESS_VALIDATOR_ID = 'gtfs_incomplete';

/** Strings Rapid's Issues panel looks up for the validator (`issues.<id>.title` / `.tip`). */
export const COMPLETENESS_VALIDATOR_STRINGS = {
  title: 'Incomplete GTFS features',
  tip: 'Find pathways whose ends aren\'t stops, levels no stop is on, and stations with no stops'
};

/**
 * Adds a validator to Rapid 3 that flags incomplete GTFS features (see
 * `completenessProblems`): pathways whose ends aren't stops, levels no stop
 * is on, and stations no stop belongs to. Issues appear on the selected
 * feature's form and in Rapid's Issues panel, with TDEI's severity (see
 * gtfs-severity.ts). Call it after `initAsync`.
 */
export function installCompletenessValidator(context: any) {
  const validation = context.systems.validator; // Rapid 3's ValidationSystem
  if (!validation?._validators || validation._validators.has(COMPLETENESS_VALIDATOR_ID)) return;

  // The checks need every stop, so index each graph once (per load).
  const indexFor = perGraph((graph): CompletenessIndex => buildCompletenessIndex(graphEntities(graph)));

  const validator = (entity: any, graph: any) => ({
    issues: completenessProblems(entity, id => graph.hasEntity(id), indexFor(graph))
      .map(problem => new Rapid.ValidationIssue(context, {
        type: COMPLETENESS_VALIDATOR_ID,
        subtype: problem.subtype,
        ...issueSeverity(COMPLETENESS_SEVERITY[problem.subtype], problem.message),
        reference: ($selection: any) => {
          $selection.selectAll('.issue-reference')
            .data([0])
            .enter()
            .append('div')
            .attr('class', 'issue-reference')
            .text(COMPLETENESS_HELP[problem.subtype]);
        },
        entityIds: [entity.id, ...problem.relatedIds],
        hash: problem.hash
      }))
  });
  validator.type = COMPLETENESS_VALIDATOR_ID;

  validation._validators.set(COMPLETENESS_VALIDATOR_ID, validator);
}

/** Help shown under an incomplete-feature issue, by subtype. */
export const COMPLETENESS_HELP: Record<string, string> = {
  pathway_end: 'In GTFS, a pathway connects two stops. Connect each end to a stop, or make the end node '
    + 'a stop (e.g. a Generic Node where pathways meet).',
  empty_level: 'A GTFS level is for the stops on it. Set the level_id of the stops on this level, or '
    + 'delete the level outline.',
  station_no_stop_id: 'Stops join a station by naming its stop_id as their parent_station. Give the station '
    + 'a stop_id (if stops pointed at its old one, use that).',
  empty_station: 'A GTFS station is made up of the stops that name it as their parent_station: its '
    + 'entrances, platforms and generic nodes. Set their parent_station to this station\'s stop_id.'
};

/** Rapid validator ID for GTFS station connection checks (also its key in Rapid's issue strings). */
export const CONNECTIVITY_VALIDATOR_ID = 'gtfs_connectivity';

/** Strings Rapid's Issues panel looks up for the validator (`issues.<id>.title` / `.tip`). */
export const CONNECTIVITY_VALIDATOR_STRINGS = {
  title: 'GTFS station connections',
  tip: 'Find platforms riders can\'t reach or leave, missing step-free routes, unconnected stops and '
    + 'pathway mistakes'
};

/**
 * Adds a validator to Rapid 3 for how stations connect through pathways (see
 * `connectivityProblems`), with TDEI's severity (see gtfs-severity.ts).
 * The checks span whole stations, so they run once per graph. Call it after
 * `initAsync`.
 */
export function installConnectivityValidator(context: any) {
  const validation = context.systems.validator; // Rapid 3's ValidationSystem
  if (!validation?._validators || validation._validators.has(CONNECTIVITY_VALIDATOR_ID)) return;

  const problemsFor = perGraph((graph): Map<string | number, ConnectivityProblem[]> =>
    connectivityProblems(graphEntities(graph)));

  const validator = (entity: any, graph: any) => ({
    issues: (problemsFor(graph).get(entity.id) ?? []).map(problem => new Rapid.ValidationIssue(context, {
      type: CONNECTIVITY_VALIDATOR_ID,
      subtype: problem.subtype,
      ...issueSeverity(problem.severity, problem.message),
      reference: ($selection: any) => {
        $selection.selectAll('.issue-reference')
          .data([0])
          .enter()
          .append('div')
          .attr('class', 'issue-reference')
          .text(CONNECTIVITY_HELP[problem.subtype]);
      },
      entityIds: [entity.id],
      hash: problem.hash
    }))
  });
  validator.type = CONNECTIVITY_VALIDATOR_ID;

  validation._validators.set(CONNECTIVITY_VALIDATOR_ID, validator);
}

/** Help shown under a station connection issue, by subtype. */
export const CONNECTIVITY_HELP: Record<string, string> = {
  unreachable: 'Riders need a route of pathways from one of the station\'s entrances. Connect it, or check '
    + 'for pathways that are one-way the wrong way.',
  no_way_out: 'Riders can get here but not back to an entrance, usually because a pathway or exit gate is '
    + 'one-way in the wrong direction (one-way runs from the pathway\'s first node to its last).',
  no_step_free: 'Every route here uses stairs, escalators or moving sidewalks. If the station is step-free, a '
    + 'walkway, ramp or elevator pathway is missing.',
  elevator_only: 'The only step-free route here uses an elevator, so riders who need it have no way in if it\'s out '
    + 'of service. If there\'s also a ramp or level walkway, add it.',
  level_unreachable: 'None of the stops on this level can be reached from an entrance. Connect them with pathways.',
  no_entrance: 'A GTFS station needs at least one entrance (Entrance/Exit) for riders to get in. Add one and '
    + 'set its parent_station.',
  same_level: 'Stairs, escalators and elevators should connect stops on different levels. Check the level_id '
    + 'of its end stops, or the pathway type.',
  exit_gate_two_way: 'In GTFS, exit gates (pathway_mode 7) only let riders leave, so is_bidirectional must be 0.',
  escalator_two_way: 'Escalators usually run one way. Set is_bidirectional to 0 unless it really runs both ways.',
  isolated: 'In GTFS, riders get between stops along pathways. Connect this stop with a pathway, or delete it.',
  pathway_ends_far_apart: 'The stops at its ends are farther apart than this kind of pathway reaches, so one is probably '
    + 'in the wrong spot. Move it, or check its level.',
  far_from_station: 'Stops belong near their station. Move this one (or its whole level) into place, or check its '
    + 'parent_station.',
  duplicate_pathway_id: 'In GTFS, each pathway_id must be unique. Change one, or clear it (the export '
    + 'generates a pathway_id when there\'s none).',
  dead_end: 'Generic nodes are where pathways meet. Connect another pathway here, or make this end a stop '
    + 'riders use (e.g. a platform).',
  duplicate_pathway: 'Two pathways of the same type join the same stops in the same direction. Delete one, '
    + 'unless they really are separate (e.g. two side-by-side walkways).',
  length_mismatch: 'length is in meters, along the pathway. Check the value, or the pathway\'s drawing.',
  traversal_time_mismatch: 'traversal_time is the seconds it takes to ride this pathway. Check the value, or '
    + 'the pathway\'s drawing.',
  stair_count_direction: 'In GTFS, stair_count is positive when the stairs go up from the pathway\'s first '
    + 'node to its last, and negative when they go down.',
  walkway_changes_level: 'Riders change level by stairs, escalator or elevator. Check the pathway type or its '
    + 'stops\' level_id. If it\'s a ramp, set max_slope.',
  boarding_area_level: 'A boarding area is part of its platform, so it should be on the same level. Check the '
    + 'level_id of both.',
  pathway_to_station: 'In GTFS, a pathway can\'t end at a station (location_type 1): it connects the station\'s '
    + 'entrances, platforms, generic nodes and boarding areas. TDEI\'s validator rejects this.',
  pathway_to_platform_with_boarding_areas: 'When a platform has boarding areas, pathways must lead to the boarding '
    + 'areas, not to the platform. TDEI\'s validator rejects this.',
  pathway_loop: 'A pathway should connect two different stops.',
  pathway_to_street_access_stop: 'A stop with stop_access 1 is reached from the street, not by the station\'s '
    + 'pathways, so no pathway should connect to it. Remove the pathway, or change stop_access.',
  elevator_end_no_level: 'With an elevator, the stops it connects need a level_id, so riders know which level '
    + 'they\'re going to. TDEI\'s validator rejects this.'
};

/** Rapid validator ID for GTFS level checks (also its key in Rapid's issue strings). */
export const LEVELS_VALIDATOR_ID = 'gtfs_levels';

/** Strings Rapid's Issues panel looks up for the validator (`issues.<id>.title` / `.tip`). */
export const LEVELS_VALIDATOR_STRINGS = {
  title: 'GTFS levels',
  tip: 'Find stops and level outlines missing a level_id, outlines bigger than their stops need, and stops '
    + 'far from the rest of their level'
};

/**
 * Adds a validator to Rapid 3 for level problems (see `levelProblems`), with
 * fixes that use the level tools: "Set level to …" (the levels the stop's
 * station uses), "Fill in a level_id" and "Refit to its stops". Call it after
 * `initAsync`.
 * @param getTools - the level tools the fixes use, once a pathways workspace has started
 */
export function installLevelsValidator(context: any, getTools: () => Rapid3LevelTools | undefined) {
  const validation = context.systems.validator; // Rapid 3's ValidationSystem
  if (!validation?._validators || validation._validators.has(LEVELS_VALIDATOR_ID)) return;

  const problemsFor = perGraph((graph): Map<string | number, LevelProblem[]> =>
    levelProblems(graphEntities(graph), id => graph.hasEntity(id)?.loc));

  const fixesFor = (entity: any, problem: LevelProblem) => {
    const tools = getTools();
    if (!tools) return [];
    const id = String(entity.id);
    switch (problem.subtype) {
      case 'missing_level':
        return (problem.levelOptions ?? []).map(option => new Rapid.ValidationFix({
          title: `Set level to ${option.label}`,
          onClick: () => getTools()?.assignLevel([id], option.levelId)
        }));
      case 'level_area_no_id':
        return [new Rapid.ValidationFix({ title: 'Fill in a level_id', onClick: () => getTools()?.fillLevelId(id) })];
      case 'large_outline':
        return problem.levelId
          ? [new Rapid.ValidationFix({ title: 'Refit to its stops', onClick: () => getTools()?.refitLevelArea(id) })]
          : [];
      case 'outside_level':
        return problem.refitAreaId
          ? [new Rapid.ValidationFix({
              title: `Refit level ${problem.levelId} to its stops`,
              onClick: () => getTools()?.refitLevelArea(problem.refitAreaId!)
            })]
          : [];
      case 'station_level_order':
        return [new Rapid.ValidationFix({
          title: (problem.stationLevelIds?.length ?? 0) > 1
            ? 'Renumber levels in the panel\'s order'
            : 'Renumber its level 0',
          onClick: () => getTools()?.renumberLevels(problem.stationLevelIds ?? [])
        })];
      default:
        return [];
    }
  };

  const validator = (entity: any, graph: any) => ({
    issues: (problemsFor(graph).get(entity.id) ?? []).map(problem => new Rapid.ValidationIssue(context, {
      type: LEVELS_VALIDATOR_ID,
      subtype: problem.subtype,
      ...issueSeverity(LEVEL_CHECK_SEVERITY[problem.subtype], problem.message),
      reference: ($selection: any) => {
        $selection.selectAll('.issue-reference')
          .data([0])
          .enter()
          .append('div')
          .attr('class', 'issue-reference')
          .text(LEVELS_HELP[problem.subtype]);
      },
      entityIds: [entity.id],
      hash: problem.hash,
      dynamicFixes: () => fixesFor(entity, problem)
    }))
  });
  validator.type = LEVELS_VALIDATOR_ID;

  validation._validators.set(LEVELS_VALIDATOR_ID, validator);
}

/** Help shown under a level issue, by subtype. */
export const LEVELS_HELP: Record<string, string> = {
  missing_level: 'Platforms, generic nodes and boarding areas need a level_id, so riders know which level '
    + 'they\'re on. Pick one of the station\'s levels.',
  level_area_no_id: 'Stops refer to a level by its level_id, so a level outline needs one.',
  large_outline: 'A level outline should cover its stops. A very large one usually means a stray stop '
    + 'stretched it, or the level is shared by stations far apart. Refit reshapes it into a box around its stops.',
  far_stop: 'This stop is far from the other stops on its level. Check its location, or whether its level_id '
    + 'should be another level.',
  station_level_order: 'GTFS numbers a station\'s levels from street level: 0 at the street, positive above and '
    + 'negative below, each level with its own number. Drag them into the right order in the Stations panel, then '
    + 'renumber them.',
  outside_level: 'Everything on a level should be inside its outline. Move it, check its level_id, or reshape the '
    + 'outline (Refit boxes a level\'s stops again).'
};

/** Validators whose checks span the workspace (see `installWorkspaceRevalidation`). */
export const WORKSPACE_VALIDATOR_IDS = [REFERENCE_VALIDATOR_ID, COMPLETENESS_VALIDATOR_ID, CONNECTIVITY_VALIDATOR_ID, LEVELS_VALIDATOR_ID];

/**
 * Keeps the workspace-spanning GTFS checks current. After an edit, Rapid only
 * re-validates the edited features and ones near them or already in an issue
 * with them, but these checks depend on features elsewhere: removing a
 * station's stop_id breaks the parent_station of all its stops, and a new
 * pathway can make a distant platform reachable. So after each validation,
 * this re-runs them over every GTFS feature and replaces their cached issues,
 * like Rapid's own `revalidateUnsquare`. Skipped when neither the data nor
 * the enabled rules changed. Call it after installing those validators.
 */
export function installWorkspaceRevalidation(context: any) {
  const validation = context.systems.validator; // Rapid 3's ValidationSystem
  if (!validation?.on || validation.__gtfsWorkspaceRevalidation) return;
  validation.__gtfsWorkspaceRevalidation = true;

  const lastRun = new WeakMap<object, string>(); // cache -> its graph's stamp and the enabled rules
  let running = false;

  const revalidate = (cache: any): boolean => {
    const graph = cache?.graph;
    if (!graph) return false;
    const enabled = WORKSPACE_VALIDATOR_IDS.filter(id => validation._validators?.has(id)
      && (validation.isValidatorEnabled?.(id) ?? true));
    const runKey = `${graphStamp(graph)}|${enabled.join(',')}`;
    if (lastRun.get(cache) === runKey) return false;
    lastRun.set(cache, runKey);

    // Only tagged nodes (stops) and ways (pathways, level outlines) can have these issues.
    const features = graphEntities(graph).filter(entity => entity.type === 'way' || Object.keys(entity.tags ?? {}).length);
    for (const id of WORKSPACE_VALIDATOR_IDS) {
      cache.uncacheIssuesOfType(id);
      if (!enabled.includes(id)) continue;
      const validator = validation._validators.get(id);
      for (const entity of features) {
        cache.cacheIssues(validator(entity, graph).issues);
      }
    }
    return true;
  };

  validation.on('validated', () => {
    if (running) return; // our own 'validated' below
    running = true;
    try {
      const changedHead = revalidate(validation._head);
      const changedBase = revalidate(validation._base);
      if (changedHead || changedBase) validation.emit('validated');
    } finally {
      running = false;
    }
  });
}

/**
 * Shows the GTFS rules in Rapid's Issues pane, and their issues on existing data.
 * - The pane's Rules list is built once, from the validators Rapid has when the
 *   pane is created (before ours are installed), so it's rebuilt here, sorted
 *   by title as Rapid sorts it.
 * - The pane lists only issues in "My edits" until the user picks "Everything",
 *   but most GTFS problems are in the loaded data, so "Everything" becomes the
 *   default (unless the user already chose).
 * Call it after installing the validators.
 */
export function showRulesInIssuesPane(context: any) {
  const validation = context.systems.validator; // Rapid 3's ValidationSystem
  const l10n = context.systems.l10n;
  const settings = context.systems.settings;
  if (!validation?.getValidatorIDs) return;

  const title = (id: string) => l10n?.t?.(`issues.${id}.title`) ?? id;
  for (const section of context.systems.ui?.Overmap?.MapPanes?.Issues?.sections ?? []) {
    if (!Array.isArray(section?._validatorIDs)) continue;
    section._validatorIDs = [...validation.getValidatorIDs()].sort((a: string, b: string) => (title(a) < title(b) ? -1 : 1));
  }

  if (settings?.get && settings.get('validator.what') === undefined) {
    settings.set('validator.what', 'all');
  }
}
