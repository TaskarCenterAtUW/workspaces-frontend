import { buildReferenceIndex, referenceProblems } from '~/services/gtfs-references';
import { graphEntities } from '~/services/rapid3-levels';
import type { ReferenceIndex } from '~/services/gtfs-references';

/** Global `Rapid` namespace injected by the Rapid v3.x script at runtime. */
declare const Rapid: any;

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
 * on the selected feature, as warnings.
 *
 * Rapid creates its validators at init and keeps them in a map, so this adds
 * one to that map; call it after `initAsync`.
 */
export function installReferenceValidator(context: any) {
  const validation = context.systems.validation;
  if (!validation?._validators || validation._validators.has(REFERENCE_VALIDATOR_ID)) return;

  // The checks need every stop and level, so index each graph once.
  const indexes = new WeakMap<object, ReferenceIndex>();
  const indexFor = (graph: any): ReferenceIndex => {
    let index = indexes.get(graph);
    if (!index) {
      index = buildReferenceIndex(graphEntities(graph));
      indexes.set(graph, index);
    }
    return index;
  };

  const validator = (entity: any, graph: any) => ({
    issues: referenceProblems(entity, indexFor(graph)).map(problem => new Rapid.ValidationIssue(context, {
      type: REFERENCE_VALIDATOR_ID,
      subtype: problem.subtype,
      severity: 'warning',
      message: () => problem.message,
      reference: ($selection: any) => {
        $selection.selectAll('.issue-reference')
          .data([0])
          .enter()
          .append('div')
          .attr('class', 'issue-reference')
          .text(REFERENCE_HELP[problem.subtype]);
      },
      entityIds: [entity.id, ...problem.relatedIds],
      hash: problem.hash
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
  level_id: 'In GTFS, level_id must match a level in levels.txt. Draw the level with '
    + '"Add level" (or "add one" next to it in the level panel), or fix the level_id.',
  stop_id: 'In GTFS, each stop_id must be unique, so that parent_station and pathways '
    + 'can refer to exactly one stop.'
};
