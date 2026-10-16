import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installReferenceValidator, REFERENCE_HELP, REFERENCE_VALIDATOR_ID } from '~/services/rapid3-validation';

// installReferenceValidator against a fake Rapid 3 context: a ValidationSystem
// holding validators in a map, and a two-layer graph.

type Entity = { id: string; type: string; tags?: Record<string, string>; nodes?: string[] };

function fakeGraph(entities: Entity[]) {
  const base = new Map(entities.map(entity => [entity.id, entity]));
  return {
    base: { entities: base },
    local: { entities: new Map<string, Entity | undefined>() },
    hasEntity: (id: string) => base.get(id)
  };
}

const entities: Entity[] = [
  { id: 's1', type: 'node', tags: { location_type: '1', stop_id: 'CENTRAL' } },
  { id: 'e1', type: 'node', tags: { location_type: '2', parent_station: 'NOWHERE', level_id: 'L9' } }
];

beforeEach(() => {
  (globalThis as any).Rapid = {
    // Stands in for Rapid's ValidationIssue class (called with `new`).
    ValidationIssue: function (this: object, _context: unknown, props: object) {
      Object.assign(this, props);
    }
  };
});

afterEach(() => {
  delete (globalThis as any).Rapid;
});

describe('installReferenceValidator', () => {
  it('adds a validator that reports reference problems as warnings', () => {
    const validators = new Map<string, any>();
    const context = { systems: { validation: { _validators: validators } } };

    installReferenceValidator(context);

    const validator = validators.get(REFERENCE_VALIDATOR_ID)!;
    expect(validator.type).toBe(REFERENCE_VALIDATOR_ID);

    const graph = fakeGraph(entities);
    const { issues } = validator(entities[1], graph);
    expect(issues.map((issue: any) => [issue.type, issue.subtype, issue.severity, issue.message()])).toEqual([
      [REFERENCE_VALIDATOR_ID, 'parent_station', 'warning', 'parent_station "NOWHERE" doesn\'t match any stop\'s stop_id'],
      [REFERENCE_VALIDATOR_ID, 'level_id', 'warning', 'level_id "L9" doesn\'t match any level outline in this workspace']
    ]);
    expect(issues[0].entityIds).toEqual(['e1']);
    expect(issues[0].hash).toBe('unknown:NOWHERE');

    expect(validator(entities[0], graph).issues).toEqual([]);
  });

  it('renders the subtype\'s help as the issue reference', () => {
    const validators = new Map<string, any>();
    installReferenceValidator({ systems: { validation: { _validators: validators } } });
    const [issue] = validators.get(REFERENCE_VALIDATOR_ID)(entities[1], fakeGraph(entities)).issues;

    const text = vi.fn();
    const chain: any = { selectAll: () => chain, data: () => chain, enter: () => chain, append: () => chain, attr: () => chain, text };
    issue.reference(chain);

    expect(text).toHaveBeenCalledWith(REFERENCE_HELP.parent_station);
  });

  it('indexes each graph once and installs only once', () => {
    const validators = new Map<string, any>();
    const context = { systems: { validation: { _validators: validators } } };
    installReferenceValidator(context);
    const validator = validators.get(REFERENCE_VALIDATOR_ID);
    installReferenceValidator(context);
    expect(validators.get(REFERENCE_VALIDATOR_ID)).toBe(validator);

    const graph = fakeGraph(entities);
    const keys = vi.spyOn(graph.base.entities, 'keys');
    validator(entities[0], graph);
    validator(entities[1], graph);
    expect(keys).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a validation system', () => {
    expect(() => installReferenceValidator({ systems: {} })).not.toThrow();
  });
});
