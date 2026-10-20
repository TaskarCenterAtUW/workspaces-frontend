import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { edgeTypeGroup, jsonbContains, unionDatasets, validateEntityFilters } from '~/services/conflation/union';
import type { UnionDataset, UnionResult } from '~/services/conflation/union';
import type { LonLat } from '~/services/conflation/geometry';

// The TDEI union test harness (TDEI-backend-service/test/union-test-harness):
// its input datasets and case catalogue (harness/cases.py), checked the way
// harness/check_cases.py checks the SQL union's output.

const FIXTURES = join(__dirname, '../fixtures/union-harness');

function loadDataset(ds: 'ds1' | 'ds2'): UnionDataset {
  const read = (kind: string) => JSON.parse(readFileSync(join(FIXTURES, `${ds}_${kind}.geojson`), 'utf8')).features as any[];
  return {
    nodes: read('nodes').map(f => ({ id: `${ds}:${f.properties._id}`, loc: f.geometry.coordinates, props: f.properties })),
    edges: read('edges').map(f => ({ id: `${ds}:${f.properties._id}`, coords: f.geometry.coordinates, props: f.properties }))
  };
}
const DS1 = loadDataset('ds1');
const DS2 = loadDataset('ds2');

const LON0 = -123.1;
const LAT0 = 44.63;
const MLAT = 111111.0;
const MLON = MLAT * Math.cos((LAT0 * Math.PI) / 180);
/** Metres east/north of the dataset origin -> lon/lat, rounded to 7 dp. */
const C = (x: number, y: number): LonLat => [Number((LON0 + x / MLON).toFixed(7)), Number((LAT0 + y / MLAT).toFixed(7))];
const distM = (a: LonLat, b: LonLat) => Math.hypot((a[0] - b[0]) * MLON, (a[1] - b[1]) * MLAT);

type ByProximity<T> = T | { 1: T; 3: T };
type Assertion
  = | ['count', string, ByProximity<number>]
    | ['junction', [number, number], number, string[]]
    | ['connected', string[]]
    | ['apart', string, string]
    | ['kerbs', ByProximity<number>]
    | ['no_kerb_merge']
    | ['ixn', number]
    | ['node_attr', [number, number], Record<string, string | null>]
    | ['at', 1 | 3, Assertion];

const CASES: { id: string; asserts: Assertion[] }[] = [
  { id: 'A', asserts: [['count', 'A: duplicate sidewalk', 1],
    ['node_attr', [0, 0], { 'tactile_paving': 'no', 'ext:surface': 'concrete', 'ext:union_audit_tactile_paving': null }]] },
  { id: 'B', asserts: [['count', 'B: base sidewalk', 1], ['count', 'B: drifting sidewalk', 0]] },
  { id: 'C', asserts: [['count', 'C: road', 2], ['count', 'C: crossing', 2], ['ixn', 1],
    ['junction', [100, 30], 4, ['C: road', 'C: crossing']]] },
  { id: 'D', asserts: [['no_kerb_merge'], ['count', 'D: sidewalk to kerb', { 1: 2, 3: 1 }], ['kerbs', { 1: 2, 3: 1 }]] },
  { id: 'E', asserts: [['count', 'E: road', 1], ['count', 'E: parallel sidewalk', 1], ['apart', 'E: road', 'E: parallel sidewalk']] },
  { id: 'F', asserts: [['count', 'F: living street', 1], ['count', 'F: nearby sidewalk', 1],
    ['apart', 'F: living street', 'F: nearby sidewalk']] },
  { id: 'G', asserts: [['count', 'G: long sidewalk', 2], ['count', 'G: short T stub', 1],
    ['junction', [160, 30], 3, ['G: long sidewalk', 'G: short T stub']]] },
  { id: 'H', asserts: [['count', 'H: sidewalk west', 1], ['count', 'H: sidewalk east', 1],
    ['junction', [40, 120], 2, ['H: sidewalk west', 'H: sidewalk east']], ['node_attr', [40, 120], { tactile_paving: 'no' }]] },
  { id: 'I', asserts: [['count', 'I: DS2-only service road', 1]] },
  { id: 'J', asserts: [['count', 'J: long DS2 sidewalk', 2], ['count', 'J: DS1 spur meeting it', 1],
    ['junction', [40, 150], 3, ['J: long DS2 sidewalk', 'J: DS1 spur meeting it']]] },
  { id: 'K', asserts: [['count', 'K: plain footway', 1]] },
  { id: 'L', asserts: [['count', 'L: road with mid node', 2], ['count', 'L: crossing ending on road node', 1], ['ixn', 0],
    ['junction', [240, 40], 3, ['L: road with mid node', 'L: crossing ending on road node']]] },
  { id: 'M', asserts: [['count', 'M: crossing', 1]] },
  { id: 'N', asserts: [['junction', [20, 210], 2, ['N: sidewalk', 'N: plain footway connector']],
    ['junction', [30, 210], 2, ['N: plain footway connector', 'N: crossing']],
    ['connected', ['N: sidewalk', 'N: plain footway connector', 'N: crossing']]] },
  { id: 'P', asserts: [['count', 'P: sidewalk', 1], ['count', 'P: duplicate sidewalk', 0], ['count', 'P: crossing off duplicate end', 1],
    ['junction', [360, 0], 2, ['P: sidewalk', 'P: crossing off duplicate end']]] },
  { id: 'Q', asserts: [['connected', ['Q: ds1 west', 'Q: ds2 link a', 'Q: ds2 link b', 'Q: ds2 link c', 'Q: ds1 east']],
    ['junction', [340, 40], 2, ['Q: ds1 west', 'Q: ds2 link a']], ['junction', [360, 40], 2, ['Q: ds2 link a', 'Q: ds2 link b']],
    ['junction', [380, 40], 2, ['Q: ds2 link b', 'Q: ds2 link c']], ['junction', [400, 40], 2, ['Q: ds2 link c', 'Q: ds1 east']]] },
  { id: 'R', asserts: [['count', 'R: long ds1 sidewalk', 2], ['count', 'R: mid-span duplicate', 0], ['count', 'R: spur off duplicate', 1],
    ['junction', [380, 80], 3, ['R: long ds1 sidewalk', 'R: spur off duplicate']]] },
  { id: 'S', asserts: [['count', 'S: ds1 sidewalk span', 2], ['count', 'S: ds2 T onto span', 1],
    ['junction', [370, 120], 3, ['S: ds1 sidewalk span', 'S: ds2 T onto span']]] },
  { id: 'U', asserts: [['count', 'U: ds1 sidewalk', 1], ['count', 'U: partly overlapping sidewalk', 1],
    ['at', 1, ['apart', 'U: ds1 sidewalk', 'U: partly overlapping sidewalk']],
    ['at', 3, ['junction', [320, 180], 2, ['U: ds1 sidewalk', 'U: partly overlapping sidewalk']]],
    ['at', 3, ['connected', ['U: ds1 sidewalk', 'U: partly overlapping sidewalk']]]] },
  { id: 'V', asserts: [['count', 'V: surface-tagged duplicate', 1]] },
  { id: 'W', asserts: [['junction', [130, 240], 2, ['W: ds1 sidewalk to kerb', 'W: ds2 sidewalk from kerb']], ['kerbs', 1],
    ['node_attr', [130, 240], { 'barrier': 'kerb', 'kerb': 'lowered', 'tactile_paving': 'yes', 'ext:union_audit_tactile_paving': null }]] }
];

/** The case's area: a box around its input edges with a 4 m margin. */
function caseArea(id: string): [LonLat, LonLat] {
  const coords = [...DS1.edges, ...DS2.edges]
    .filter(e => String(e.props.name ?? '').startsWith(`${id}:`))
    .flatMap(e => e.coords.map(([lon, lat]) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT]));
  const xs = coords.map(c => c[0]!);
  const ys = coords.map(c => c[1]!);
  return [C(Math.min(...xs) - 4, Math.min(...ys) - 4), C(Math.max(...xs) + 4, Math.max(...ys) + 4)];
}
const inside = ([min, max]: [LonLat, LonLat], p: LonLat) => p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1];

/** Evaluates an assertion against a union result; returns a failure message, or undefined if it holds. */
function check(result: UnionResult, proximity: 1 | 3, area: [LonLat, LonLat], a: Assertion): string | undefined {
  const value = <T>(v: ByProximity<T>): T => (typeof v === 'object' && v !== null && 1 in (v as object) ? (v as any)[proximity] : v) as T;
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const degree = new Map<string, number>();
  const touching = new Map<string, Set<string>>();
  const byName = new Map<string, string[]>();
  for (const e of result.edges) {
    parent.set(find(e.u), find(e.v));
    const name = String(e.props.name ?? '');
    for (const k of [e.u, e.v]) {
      degree.set(k, (degree.get(k) ?? 0) + 1);
      touching.set(k, (touching.get(k) ?? new Set()).add(name));
    }
    byName.set(name, [...(byName.get(name) ?? []), e.u]);
  }
  const nodeNear = (xy: [number, number]) => {
    const target = C(...xy);
    const best = [...result.nodes].sort((p, q) => distM(p.loc, target) - distM(q.loc, target))[0];
    return best && distM(best.loc, target) <= 0.05 ? best : undefined;
  };

  switch (a[0]) {
    case 'at':
      return a[1] === proximity ? check(result, proximity, area, a[2]) : undefined;
    case 'count': {
      const want = value(a[2]);
      const got = byName.get(a[1])?.length ?? 0;
      return got === want ? undefined : `${a[1]}: expected ${want}, got ${got}`;
    }
    case 'junction': {
      const node = nodeNear(a[1]);
      if (!node) return `no node at junction (${a[1]})`;
      const missing = a[3].filter(n => !touching.get(node.id)?.has(n));
      const deg = degree.get(node.id) ?? 0;
      return deg >= a[2] && !missing.length ? undefined : `junction (${a[1]}): ${deg} edges (need ${a[2]}+), missing ${missing.join(', ')}`;
    }
    case 'connected': {
      const comps = new Set(a[1].flatMap(n => (byName.get(n) ?? []).map(find)));
      const absent = a[1].filter(n => !byName.get(n)?.length);
      return comps.size === 1 && !absent.length ? undefined : `split into ${comps.size} pieces, missing ${absent.join(', ')}`;
    }
    case 'apart': {
      const ca = new Set((byName.get(a[1]) ?? []).map(find));
      const cb = (byName.get(a[2]) ?? []).map(find);
      return cb.some(c => ca.has(c)) ? `${a[1]} and ${a[2]} wrongly connected` : undefined;
    }
    case 'kerbs': {
      const want = value(a[1]);
      const got = result.nodes.filter(n => inside(area, n.loc) && n.props.barrier === 'kerb').length;
      return got === want ? undefined : `kerb nodes: expected ${want}, got ${got}`;
    }
    case 'no_kerb_merge': {
      const bad = result.nodes.find(n => inside(area, n.loc) && n.props.barrier === 'kerb' && 'ext:union_audit_barrier' in n.props);
      return bad ? `kerb merged into node ${bad.id}` : undefined;
    }
    case 'ixn': {
      const got = result.nodes.filter(n => inside(area, n.loc) && n.id.startsWith('ixn-')).length;
      return got === a[1] ? undefined : `intersection nodes: expected ${a[1]}, got ${got}`;
    }
    case 'node_attr': {
      const node = nodeNear(a[1]);
      if (!node) return `no node at (${a[1]})`;
      const bad = Object.entries(a[2]).filter(([k, v]) => (v === null ? !(k in node.props) : node.props[k] !== v));
      return bad.length ? `wrong/missing: ${bad.map(([k]) => `${k}=${String(node.props[k])}`).join(', ')}` : undefined;
    }
  }
}

describe.each([1, 3] as const)('TDEI union harness cases at %i m', (proximity) => {
  const result = unionDatasets(DS1, DS2, { proximity });

  it.each(CASES.map(c => [c.id, c] as const))('case %s', (_id, c) => {
    const area = caseArea(c.id);
    const failures = c.asserts.map(a => check(result, proximity, area, a)).filter(Boolean);
    expect(failures).toEqual([]);
  });

  it('references only nodes it outputs, and outputs only referenced nodes', () => {
    const ids = new Set(result.nodes.map(n => n.id));
    const refs = new Set(result.edges.flatMap(e => [e.u, e.v]));
    expect([...refs].filter(id => !ids.has(id))).toEqual([]);
    expect([...ids].filter(id => !refs.has(id))).toEqual([]);
  });

  it('starts and ends every edge at its nodes', () => {
    const at = new Map(result.nodes.map(n => [n.id, n.loc]));
    const bad = result.edges.filter((e) => {
      const first = e.coords[0]!;
      const last = e.coords[e.coords.length - 1]!;
      return first.join() !== at.get(e.u)?.join() || last.join() !== at.get(e.v)?.join();
    });
    expect(bad.filter(e => e.source === 'ds2').map(e => e.id)).toEqual([]);
  });
});

describe('union helpers', () => {
  it('classes edges into type groups as the SQL does, living_street as bike', () => {
    expect(edgeTypeGroup({ highway: 'footway', footway: 'crossing' })).toBe('crossing');
    expect(edgeTypeGroup({ highway: 'living_street' })).toBe('bike');
    expect(edgeTypeGroup({ highway: 'steps' })).toBe('pedestrian');
    expect(edgeTypeGroup({ highway: 'service' })).toBe('road');
    expect(edgeTypeGroup({ highway: 'cycleway' })).toBe('other');
  });

  it('matches filters with jsonb containment', () => {
    expect(jsonbContains({ highway: 'footway', footway: 'sidewalk' }, { highway: 'footway' })).toBe(true);
    expect(jsonbContains({ width: '3' }, { width: 3 })).toBe(false);
    expect(jsonbContains({ a: [1, 2, 3] }, { a: [3, 1] })).toBe(true);
    expect(jsonbContains({ a: 1 }, {})).toBe(true);
  });

  it('rejects unknown or misplaced filter settings', () => {
    expect(() => validateEntityFilters({ way: {} })).toThrow(/unknown file type/);
    expect(() => validateEntityFilters({ edge: { buffer: 3 } })).toThrow(/unknown setting/);
    expect(() => validateEntityFilters({ zone: { duplicate_buffer_width: 3 } })).toThrow(/not supported/);
    expect(() => validateEntityFilters({ node: { duplicate_overlap_percentage: 50 } })).toThrow(/not supported/);
    expect(() => validateEntityFilters({ edge: { filters: [{ highway: 'footway' }], duplicate_overlap_percentage: 50 } })).not.toThrow();
  });
});
