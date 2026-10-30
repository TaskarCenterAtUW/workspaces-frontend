import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPLETENESS_HELP,
  CONNECTIVITY_HELP,
  CONNECTIVITY_VALIDATOR_ID,
  installCloseNodesFilter,
  installConnectivityValidator,
  COMPLETENESS_VALIDATOR_ID,
  installCompletenessValidator,
  installReferenceValidator,
  installRequiredFieldsValidator,
  installLevelsValidator,
  installWorkspaceRevalidation,
  LEVELS_HELP,
  LEVELS_VALIDATOR_ID,
  perGraph,
  pointsMayShareLocation,
  showRulesInIssuesPane,
  REFERENCE_HELP,
  REFERENCE_VALIDATOR_ID,
  REQUIRED_FIELDS_HELP,
  REQUIRED_FIELDS_VALIDATOR_ID,
  WORKSPACE_VALIDATOR_IDS
} from '~/services/rapid3-validation';

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
    // Stands in for Rapid's ValidationFix class (called with `new`).
    ValidationFix: function (this: object, props: object) {
      Object.assign(this, props);
    },
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
  it('adds a validator that reports reference problems as warnings, labelled when they fail the upload', () => {
    const validators = new Map<string, any>();
    const context = { systems: { validator: { _validators: validators } } };

    installReferenceValidator(context);

    const validator = validators.get(REFERENCE_VALIDATOR_ID)!;
    expect(validator.type).toBe(REFERENCE_VALIDATOR_ID);

    const graph = fakeGraph(entities);
    const { issues } = validator(entities[1], graph);
    expect(issues.map((issue: any) => [issue.type, issue.subtype, issue.severity, issue.message()])).toEqual([
      // An entrance is pathways data: reported, but it doesn't fail the upload while TDEI is lenient
      [REFERENCE_VALIDATOR_ID, 'parent_station', 'warning', 'parent_station "NOWHERE" doesn\'t match any stop\'s stop_id'],
      [REFERENCE_VALIDATOR_ID, 'level_id', 'warning', 'level_id "L9" doesn\'t match any level outline in this workspace']
    ]);
    // A platform's parent_station is core GTFS, so it fails either way
    const platform = { id: 'p1', type: 'node', tags: { location_type: '0', parent_station: 'NOWHERE' } };
    expect(validator(platform, fakeGraph([...entities, platform])).issues.map((issue: any) => issue.message()))
      .toEqual(['Fails TDEI upload: parent_station "NOWHERE" doesn\'t match any stop\'s stop_id']);
    expect(issues[0].entityIds).toEqual(['e1']);
    expect(issues[0].hash).toBe('unknown:NOWHERE');

    expect(validator(entities[0], graph).issues).toEqual([]);
  });

  it('renders the subtype\'s help as the issue reference', () => {
    const validators = new Map<string, any>();
    installReferenceValidator({ systems: { validator: { _validators: validators } } });
    const [issue] = validators.get(REFERENCE_VALIDATOR_ID)(entities[1], fakeGraph(entities)).issues;

    const text = vi.fn();
    const chain: any = { selectAll: () => chain, data: () => chain, enter: () => chain, append: () => chain, attr: () => chain, text };
    issue.reference(chain);

    expect(text).toHaveBeenCalledWith(REFERENCE_HELP.parent_station);
  });

  it('indexes each graph once and installs only once', () => {
    const validators = new Map<string, any>();
    const context = { systems: { validator: { _validators: validators } } };
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

describe('pointsMayShareLocation', () => {
  const point = (tags?: Record<string, string>) => ({ tags });

  it('allows points on different levels', () => {
    expect(pointsMayShareLocation(point({ level_id: 'L0' }), point({ level_id: 'L1' }))).toBe(true);
    expect(pointsMayShareLocation(point({ level_id: 'L0' }), point())).toBe(true);
  });

  it('allows points of different types', () => {
    expect(pointsMayShareLocation(point({ location_type: '1' }), point({ location_type: '3' }))).toBe(true);
    expect(pointsMayShareLocation(point({ location_type: '1' }), point())).toBe(true);
  });

  it('flags points of the same type on the same level', () => {
    expect(pointsMayShareLocation(point({ level_id: 'L0', location_type: '3' }), point({ level_id: ' L0 ', location_type: '3' }))).toBe(false);
    expect(pointsMayShareLocation(point(), point())).toBe(false);
  });

  it('treats a missing or blank location_type as 0, as GTFS does', () => {
    expect(pointsMayShareLocation(point({ location_type: '0' }), point())).toBe(false);
    expect(pointsMayShareLocation(point({ location_type: ' ' }), point({ location_type: '0' }))).toBe(false);
  });
});

describe('installCloseNodesFilter', () => {
  const station = { id: 's1', type: 'node', tags: { location_type: '1' } };
  const node = { id: 'n1', type: 'node', tags: { location_type: '3', level_id: 'L0' } };
  const sameNode = { id: 'n2', type: 'node', tags: { location_type: '3', level_id: 'L0' } };
  const graph = fakeGraph([station, node, sameNode]);
  const detached = (...entityIds: string[]) => ({ subtype: 'detached', entityIds });

  function filtered(issues: object[]) {
    const validators = new Map<string, any>([['close_nodes', () => ({ issues })]]);
    installCloseNodesFilter({ systems: { validator: { _validators: validators } } });
    return validators.get('close_nodes')(node, graph).issues;
  }

  it('drops the warning for points of different types or on different levels', () => {
    expect(filtered([detached('n1', 's1')])).toEqual([]);
  });

  it('keeps it for points of the same type on the same level', () => {
    const issue = detached('n1', 'n2');
    expect(filtered([issue])).toEqual([issue]);
  });

  it('leaves warnings about points within a line or area alone', () => {
    const issue = { subtype: 'vertices', entityIds: ['w1', 'n1', 's1'] };
    expect(filtered([issue])).toEqual([issue]);
  });

  it('does nothing if Rapid has no such check', () => {
    const validators = new Map<string, any>();
    installCloseNodesFilter({ systems: { validator: { _validators: validators } } });
    expect(validators.size).toBe(0);
  });
});

describe('installRequiredFieldsValidator', () => {
  it('adds a validator that reports missing required fields as warnings that fail the upload, with help', () => {
    const validators = new Map<string, any>();
    installRequiredFieldsValidator({ systems: { validator: { _validators: validators } } });

    const validator = validators.get(REQUIRED_FIELDS_VALIDATOR_ID)!;
    expect(validator.type).toBe(REQUIRED_FIELDS_VALIDATOR_ID);

    const station = { id: 's1', type: 'node', tags: { location_type: '1', stop_id: 'CENTRAL' } };
    const { issues } = validator(station, fakeGraph([station]));
    expect(issues.map((issue: any) => [issue.type, issue.subtype, issue.severity, issue.message(), issue.entityIds, issue.hash]))
      .toEqual([[REQUIRED_FIELDS_VALIDATOR_ID, 'stop_name', 'warning', 'Fails TDEI upload: This station needs a stop_name', ['s1'], 'missing:stop_name']]);

    const appended: string[] = [];
    const $selection = {
      selectAll: () => ({ data: () => ({ enter: () => ({ append: () => ({ attr: () => ({ text: (text: string) => appended.push(text) }) }) }) }) })
    };
    issues[0].reference($selection);
    expect(appended).toEqual([REQUIRED_FIELDS_HELP.stop_name]);

    const named = { ...station, tags: { ...station.tags, stop_name: 'Central' } };
    expect(validator(named, fakeGraph([named])).issues).toEqual([]);
  });

  it('installs once, and only with a validation system', () => {
    const validators = new Map<string, any>();
    const context = { systems: { validator: { _validators: validators } } };
    installRequiredFieldsValidator(context);
    const first = validators.get(REQUIRED_FIELDS_VALIDATOR_ID);
    installRequiredFieldsValidator(context);
    expect(validators.get(REQUIRED_FIELDS_VALIDATOR_ID)).toBe(first);
    expect(() => installRequiredFieldsValidator({ systems: {} })).not.toThrow();
  });

  it('has help for every subtype', () => {
    expect(Object.keys(REQUIRED_FIELDS_HELP).sort()).toEqual(['is_bidirectional', 'level_index', 'pathway_mode', 'stop_name']);
  });
});

describe('installCompletenessValidator', () => {
  it('adds a validator that reports incomplete features as warnings, involving related features', () => {
    const validators = new Map<string, any>();
    installCompletenessValidator({ systems: { validator: { _validators: validators } } });
    const validator = validators.get(COMPLETENESS_VALIDATOR_ID)!;
    expect(validator.type).toBe(COMPLETENESS_VALIDATOR_ID);

    const features: Entity[] = [
      { id: 's1', type: 'node', tags: { location_type: '1', stop_id: 'CENTRAL', stop_name: 'Central' } },
      { id: 'n1', type: 'node', tags: { location_type: '3', parent_station: 'CENTRAL' } },
      { id: 'x1', type: 'node' },
      { id: 'p1', type: 'way', nodes: ['n1', 'x1'], tags: { pathway_mode: '1' } }
    ];
    const graph = fakeGraph(features);
    const { issues } = validator(features[3], graph);
    expect(issues.map((issue: any) => [issue.type, issue.subtype, issue.severity, issue.message(), issue.entityIds]))
      .toEqual([[COMPLETENESS_VALIDATOR_ID, 'pathway_end', 'warning', 'This pathway\'s end isn\'t a stop', ['p1', 'x1']]]);
    expect(validator(features[0], graph).issues).toEqual([]); // Central has a stop
  });

  it('has help for every subtype', () => {
    expect(Object.keys(COMPLETENESS_HELP).sort()).toEqual(['empty_level', 'empty_station', 'pathway_end', 'station_no_stop_id']);
  });
});

describe('installConnectivityValidator', () => {
  it('reports each feature\'s connection problems with their own severity', () => {
    const validators = new Map<string, any>();
    installConnectivityValidator({ systems: { validator: { _validators: validators } } });
    const validator = validators.get(CONNECTIVITY_VALIDATOR_ID)!;
    expect(validator.type).toBe(CONNECTIVITY_VALIDATOR_ID);

    const features: Entity[] = [
      { id: 's1', type: 'node', tags: { location_type: '1', stop_id: 'S', stop_name: 'Central' } },
      { id: 'e1', type: 'node', tags: { location_type: '2', parent_station: 'S' } },
      { id: 'p1', type: 'node', tags: { location_type: '0', parent_station: 'S' } },
      { id: 'w1', type: 'way', nodes: ['e1', 'p1'], tags: { pathway_mode: '2', is_bidirectional: '1' } }
    ];
    const graph = fakeGraph(features);
    const { issues } = validator(features[2], graph);
    expect(issues.map((issue: any) => [issue.type, issue.subtype, issue.severity, issue.message(), issue.entityIds]))
      .toEqual([[CONNECTIVITY_VALIDATOR_ID, 'no_step_free', 'suggestion',
        'This platform can only be reached by stairs, escalators or moving sidewalks', ['p1']]]);
    expect(validator(features[1], graph).issues).toEqual([]);
  });

  it('has help for every subtype', () => {
    expect(Object.keys(CONNECTIVITY_HELP).sort()).toEqual([
      'boarding_area_level', 'dead_end', 'duplicate_pathway', 'duplicate_pathway_id', 'elevator_end_no_level',
      'elevator_only', 'exit_gate_two_way', 'far_from_station', 'isolated', 'length_too_long',
      'length_too_short', 'level_unreachable', 'no_entrance', 'no_step_free', 'no_way_out', 'pathway_ends_far_apart', 'pathway_loop',
      'pathway_to_platform_with_boarding_areas',
      'pathway_to_station', 'pathway_to_street_access_stop', 'same_level', 'stair_count_direction', 'stairs_short_within_level', 'stops_share_location', 'stops_share_position',
      'traversal_time_mismatch', 'unreachable', 'walkway_changes_level'
    ]);
  });
});

describe('installWorkspaceRevalidation', () => {
  /** A fake Rapid ValidationSystem: validators, 'validated' listeners, and head/base issue caches. */
  function fakeValidation(features: Entity[]) {
    const listeners: (() => void)[] = [];
    const cache = (key: string) => {
      const graph = { ...fakeGraph(features), key };
      return {
        graph,
        issues: [] as any[],
        uncacheIssuesOfType(type: string) {
          this.issues = this.issues.filter(issue => issue.type !== type);
        },
        cacheIssues(issues: any[]) {
          this.issues.push(...issues);
        }
      };
    };
    const disabled = new Set<string>();
    const validation = {
      _validators: new Map<string, any>(),
      _head: cache('head-1'),
      _base: cache('base-1'),
      on: (event: string, fn: () => void) => event === 'validated' && listeners.push(fn),
      emit: vi.fn((event: string) => event === 'validated' && listeners.forEach(fn => fn())),
      isValidatorEnabled: (id: string) => !disabled.has(id)
    };
    const context = { systems: { validator: validation } };
    installReferenceValidator(context);
    installCompletenessValidator(context);
    installConnectivityValidator(context);
    installWorkspaceRevalidation(context);
    return { validation, disabled, fire: () => listeners.forEach(fn => fn()) };
  }

  // A station whose stops name it by a stop_id it no longer has. (Its name
  // doesn't make CENTRAL, the stop_id suggested for a station without one.)
  const features: Entity[] = [
    { id: 's1', type: 'node', tags: { location_type: '1', stop_name: 'Central Station' } },
    { id: 'e1', type: 'node', tags: { location_type: '2', parent_station: 'CENTRAL', stop_name: 'Main' } },
    { id: 'x1', type: 'node' }
  ];

  it('re-runs the workspace-spanning checks over every feature after a validation', () => {
    const { validation, fire } = fakeValidation(features);
    validation._head.issues.push({ type: REFERENCE_VALIDATOR_ID, subtype: 'stale' }, { type: 'other_rule' });
    fire();

    const found = (cache: any) => cache.issues.map((issue: any) => [issue.type, issue.subtype, issue.entityIds?.[0]]);
    // The entrance's broken parent_station is found though only the station changed.
    expect(found(validation._head)).toContainEqual([REFERENCE_VALIDATOR_ID, 'parent_station', 'e1']);
    expect(found(validation._head)).toContainEqual([COMPLETENESS_VALIDATOR_ID, 'station_no_stop_id', 's1']);
    expect(found(validation._head)).not.toContainEqual([REFERENCE_VALIDATOR_ID, 'stale', undefined]); // replaced
    expect(found(validation._head)).toContainEqual(['other_rule', undefined, undefined]); // other rules untouched
    expect(found(validation._base)).toContainEqual([REFERENCE_VALIDATOR_ID, 'parent_station', 'e1']);
    expect(validation.emit).toHaveBeenCalledTimes(1); // once, without looping
    expect(WORKSPACE_VALIDATOR_IDS).toEqual([REFERENCE_VALIDATOR_ID, COMPLETENESS_VALIDATOR_ID, CONNECTIVITY_VALIDATOR_ID, LEVELS_VALIDATOR_ID]);
  });

  it('skips re-running when neither the data nor the enabled rules changed', () => {
    const { validation, disabled, fire } = fakeValidation(features);
    fire();
    const count = validation._head.issues.length;
    fire();
    expect(validation.emit).toHaveBeenCalledTimes(1);
    expect(validation._head.issues).toHaveLength(count);

    // Turning a rule off clears its issues.
    disabled.add(REFERENCE_VALIDATOR_ID);
    fire();
    expect(validation._head.issues.some((issue: any) => issue.type === REFERENCE_VALIDATOR_ID)).toBe(false);
    expect(validation.emit).toHaveBeenCalledTimes(2);
  });
});

describe('per-graph caching', () => {
  it('rebuilds when data is merged into the same graph object, as Rapid loads it', () => {
    const graph = { ...fakeGraph([{ id: 'n1', type: 'node' }]), key: 'g1v0' };
    const build = vi.fn((g: any) => g.base.entities.size);
    const sizeOf = perGraph(build);

    expect(sizeOf(graph)).toBe(1);
    expect(sizeOf(graph)).toBe(1);
    expect(build).toHaveBeenCalledTimes(1);

    graph.base.entities.set('n2', { id: 'n2', type: 'node' }); // merged in place; key unchanged
    expect(sizeOf(graph)).toBe(2);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('stops flagging a level as empty once its stops load', () => {
    const validators = new Map<string, any>();
    installCompletenessValidator({ systems: { validator: { _validators: validators } } });
    const validator = validators.get(COMPLETENESS_VALIDATOR_ID)!;

    const outline: Entity = { id: 'a1', type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { level_id: 'N06_L1', level_index: '1' } };
    const graph = fakeGraph([outline]);
    expect(validator(outline, graph).issues.map((issue: any) => issue.subtype)).toEqual(['empty_level']);

    graph.base.entities.set('n1', { id: 'n1', type: 'node', tags: { location_type: '3', level_id: 'N06_L1' } });
    expect(validator(outline, graph).issues).toEqual([]);
  });
});

describe('installLevelsValidator', () => {
  type Loc = { loc?: [number, number] };
  const at = (entity: Entity, loc: [number, number]): Entity & Loc => ({ ...entity, loc });
  const features: (Entity & Loc)[] = [
    at({ id: 's1', type: 'node', tags: { location_type: '1', stop_id: 'STN_N06', stop_name: 'Wiehle' } }, [0, 0]),
    at({ id: 'n1', type: 'node', tags: { location_type: '3', parent_station: 'STN_N06', level_id: 'N06_L1' } }, [0, 0]),
    at({ id: 'n2', type: 'node', tags: { location_type: '3', parent_station: 'STN_N06', level_id: 'N06_L2' } }, [0.0005, 0]),
    at({ id: 'p1', type: 'node', tags: { location_type: '0', parent_station: 'STN_N06' } }, [0, 0.0005]), // no level
    { id: 'a1', type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { level_id: 'N06_L1', level_index: '1', level_name: 'Mezzanine' } },
    { id: 'a2', type: 'way', nodes: ['c1', 'c2', 'c3', 'c1'], tags: { level_index: '2' } }, // no level_id
    at({ id: 'c1', type: 'node' }, [0, 0]), at({ id: 'c2', type: 'node' }, [0.02, 0]), at({ id: 'c3', type: 'node' }, [0.02, 0.001]) // ~2 km
  ];

  function install(entities = features) {
    const validators = new Map<string, any>();
    const tools = { assignLevel: vi.fn(), fillLevelId: vi.fn(), refitLevelArea: vi.fn(), outlineLevels: vi.fn(), renumberLevels: vi.fn() };
    installLevelsValidator({ systems: { validator: { _validators: validators } } }, () => tools as any);
    const graph = { ...fakeGraph(entities), hasEntity: (id: string) => entities.find(f => f.id === id) };
    const issuesOf = (id: string) => validators.get(LEVELS_VALIDATOR_ID)(entities.find(f => f.id === id), graph).issues;
    return { tools, issuesOf, validators };
  }

  it('flags a stop with no level, offering the levels its station uses', () => {
    const { tools, issuesOf } = install();
    const [issue] = issuesOf('p1');
    expect([issue.type, issue.subtype, issue.severity, issue.message()]).toEqual([LEVELS_VALIDATOR_ID, 'missing_level', 'warning', 'This platform has no level_id']);
    const fixes = issue.dynamicFixes();
    expect(fixes.map((fix: any) => fix.title)).toEqual(['Set level to Mezzanine (N06_L1)', 'Set level to N06_L2']);
    fixes[0].onClick();
    expect(tools.assignLevel).toHaveBeenCalledWith(['p1'], 'N06_L1');
  });

  it('flags an outline with no level_id, offering to fill one in', () => {
    const { tools, issuesOf } = install();
    const issues = issuesOf('a2');
    expect(issues.map((issue: any) => issue.subtype)).toContain('level_area_no_id');
    const fill = issues.find((issue: any) => issue.subtype === 'level_area_no_id').dynamicFixes()[0];
    expect(fill.title).toBe('Fill in a level_id');
    fill.onClick();
    expect(tools.fillLevelId).toHaveBeenCalledWith('a2');
  });

  it('flags a very large outline, offering to refit it', () => {
    const { tools, issuesOf } = install();
    const large = issuesOf('a1').find((issue: any) => issue.subtype === 'large_outline');
    expect(large.message()).toBe('Level Mezzanine (N06_L1) is 2.2 km across, but its stops fit in 20 m');
    const refit = large.dynamicFixes()[0];
    expect(refit.title).toBe('Refit to its stops');
    refit.onClick();
    expect(tools.refitLevelArea).toHaveBeenCalledWith('a1');
  });

  it('flags a station whose levels are numbered far from street level, offering to renumber them', () => {
    // Wiehle's only indexed level is N06_L1; number it as if counted across the whole feed.
    const { tools, issuesOf } = install(features.map(feature =>
      (feature.id === 'a1' ? { ...feature, tags: { ...feature.tags, level_index: '201' } } : feature)));
    const issue = issuesOf('s1').find((found: any) => found.subtype === 'station_level_order');
    expect(issue.message()).toBe('Station Wiehle\'s only level is numbered 201, far from street level (0)');
    const [fix] = issue.dynamicFixes();
    expect(fix.title).toBe('Renumber its level 0');
    fix.onClick();
    expect(tools.renumberLevels).toHaveBeenCalledWith(['N06_L1']);
  });

  it('offers to refit the level a stop is outside of', () => {
    const validators = new Map<string, any>();
    const tools = { refitLevelArea: vi.fn() };
    installLevelsValidator({ systems: { validator: { _validators: validators } } }, () => tools as any);
    const shapes: (Entity & { loc?: [number, number] })[] = [
      { id: 'b1', type: 'way', nodes: ['k1', 'k2', 'k3', 'k4', 'k1'], tags: { level_id: 'L1', level_index: '0' } },
      { id: 'k1', type: 'node', loc: [0, 0] }, { id: 'k2', type: 'node', loc: [1, 0] },
      { id: 'k3', type: 'node', loc: [1, 1] }, { id: 'k4', type: 'node', loc: [0, 1] },
      { id: 'n1', type: 'node', tags: { location_type: '3', level_id: 'L1' }, loc: [5, 5] }
    ];
    const graph = { ...fakeGraph(shapes), hasEntity: (id: string) => shapes.find(f => f.id === id) };
    const issue = validators.get(LEVELS_VALIDATOR_ID)(shapes[5], graph).issues.find((found: any) => found.subtype === 'outside_level');
    expect(issue.message()).toBe('This generic node is outside level L1\'s outline');
    const [fix] = issue.dynamicFixes();
    expect(fix.title).toBe('Refit level L1 to its stops');
    fix.onClick();
    expect(tools.refitLevelArea).toHaveBeenCalledWith('b1');
  });

  it('offers no fixes before the level tools exist, and has help for every subtype', () => {
    const validators = new Map<string, any>();
    installLevelsValidator({ systems: { validator: { _validators: validators } } }, () => undefined);
    const graph = { ...fakeGraph(features), hasEntity: (id: string) => features.find(f => f.id === id) };
    const [issue] = validators.get(LEVELS_VALIDATOR_ID)(features[3], graph).issues;
    expect(issue.dynamicFixes()).toEqual([]);
    expect(Object.keys(LEVELS_HELP).sort()).toEqual([
      'far_stop', 'large_outline', 'level_area_no_id', 'missing_level', 'outside_level', 'station_level_order'
    ]);
  });
});

describe('the references validator\'s level fix', () => {
  it('offers to outline a level_id that has no outline', () => {
    const validators = new Map<string, any>();
    const tools = { outlineLevels: vi.fn() };
    installReferenceValidator({ systems: { validator: { _validators: validators } } }, () => tools as any);
    const stop: Entity = { id: 'n1', type: 'node', tags: { location_type: '3', level_id: 'N06_L3' } };
    const issue = validators.get(REFERENCE_VALIDATOR_ID)(stop, fakeGraph([stop])).issues
      .find((found: any) => found.subtype === 'level_id');
    const [fix] = issue.dynamicFixes();
    expect(fix.title).toBe('Outline level N06_L3 around its stops');
    fix.onClick();
    expect(tools.outlineLevels).toHaveBeenCalledWith(['N06_L3']);
  });
});

describe('showRulesInIssuesPane', () => {
  function fakeContext(what?: string) {
    const rules = { _validatorIDs: ['almost_junction', 'crossing_ways'] };
    const settingsStore = new Map<string, string>(what ? [['validator.what', what]] : []);
    const titles: Record<string, string> = {
      almost_junction: 'Almost junctions', crossing_ways: 'Crossing ways', gtfs_levels: 'GTFS levels'
    };
    return {
      rules,
      settingsStore,
      context: {
        systems: {
          validator: { getValidatorIDs: () => ['almost_junction', 'gtfs_levels', 'crossing_ways'] },
          l10n: { t: (key: string) => titles[key.split('.')[1]!] ?? key },
          settings: { get: (key: string) => settingsStore.get(key), set: (key: string, value: string) => settingsStore.set(key, value) },
          ui: { Overmap: { MapPanes: { Issues: { sections: [{}, rules] } } } }
        }
      }
    };
  }

  it('rebuilds the Rules list with our validators, sorted by title', () => {
    const { rules, context } = fakeContext();
    showRulesInIssuesPane(context);
    expect(rules._validatorIDs).toEqual(['almost_junction', 'crossing_ways', 'gtfs_levels']);
  });

  it('shows issues on all data by default, but keeps a choice the user made', () => {
    const fresh = fakeContext();
    showRulesInIssuesPane(fresh.context);
    expect(fresh.settingsStore.get('validator.what')).toBe('all');

    const chosen = fakeContext('edited');
    showRulesInIssuesPane(chosen.context);
    expect(chosen.settingsStore.get('validator.what')).toBe('edited');
  });

  it('does nothing without a validation system', () => {
    expect(() => showRulesInIssuesPane({ systems: {} })).not.toThrow();
  });
});
