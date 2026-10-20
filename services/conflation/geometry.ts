/**
 * Planar geometry on [lon, lat] degrees, reproducing the PostGIS operations
 * the TDEI union SQL uses (`content.tdei_union_dataset`). That SQL works on
 * SRID 4326 `geometry`, not `geography`, so every distance, fraction and
 * length here is plain Euclidean math in degrees, as PostGIS computes it.
 * Metres come from one fixed scale per run (see `MetricScale`).
 */

export type LonLat = [number, number];

/** Euclidean distance in degrees (`ST_Distance` on two points). */
export function dist(a: LonLat, b: LonLat): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Exact coordinate equality (`ST_Equals` on two points). */
export function equals(a: LonLat, b: LonLat): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Metres per degree for one run: the SQL scales longitude by the cosine of
 * one centre latitude, not per point (an equirectangular approximation).
 */
export class MetricScale {
  readonly mPerDegLat = 111111.0;
  readonly mPerDegLon: number;

  constructor(centreLat: number) {
    this.mPerDegLon = this.mPerDegLat * Math.cos((centreLat * Math.PI) / 180);
  }

  /** Distance in metres between two points (`dist_m`). */
  distM(a: LonLat, b: LonLat): number {
    return Math.hypot((a[0] - b[0]) * this.mPerDegLon, (a[1] - b[1]) * this.mPerDegLat);
  }

  /** A degree vector scaled to metres. */
  toMetres(v: LonLat): LonLat {
    return [v[0] * this.mPerDegLon, v[1] * this.mPerDegLat];
  }

  /** A distance in metres as degrees, the way the SQL converts radii (`/ max(m_per_deg_lon, 1)`). */
  degrees(metres: number): number {
    return metres / Math.max(this.mPerDegLon, 1.0);
  }
}

/** The closest point on segment a-b to p, and its parameter t in [0, 1] along the segment. */
function closestOnSegment(p: LonLat, a: LonLat, b: LonLat): { point: LonLat; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { point: [a[0], a[1]], t: 0 };
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { point: [a[0] + t * dx, a[1] + t * dy], t };
}

/** Length of a line in degrees (`ST_Length`). */
export function lineLength(line: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += dist(line[i - 1]!, line[i]!);
  return total;
}

/**
 * The closest point on a line to p (`ST_ClosestPoint`), with its fraction of
 * the line's length (`ST_LineLocatePoint`). The first nearest segment wins.
 */
export function locate(line: LonLat[], p: LonLat): { point: LonLat; fraction: number; distance: number } {
  if (line.length === 1) return { point: [line[0]![0], line[0]![1]], fraction: 0, distance: dist(line[0]!, p) };
  let best = { point: [line[0]![0], line[0]![1]] as LonLat, distance: Infinity, along: 0 };
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const seg = dist(a, b);
    const { point, t } = closestOnSegment(p, a, b);
    const d = dist(point, p);
    if (d < best.distance) best = { point, distance: d, along: walked + t * seg };
    walked += seg;
  }
  return { point: best.point, fraction: walked > 0 ? best.along / walked : 0, distance: best.distance };
}

/** Distance in degrees from a point to a line (`ST_Distance`). */
export function distToLine(line: LonLat[], p: LonLat): number {
  return locate(line, p).distance;
}

/** The point at a fraction of a line's length (`ST_LineInterpolatePoint`). */
export function interpolate(line: LonLat[], fraction: number): LonLat {
  const total = lineLength(line);
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const seg = dist(a, b);
    if (walked + seg >= target && seg > 0) {
      const t = (target - walked) / seg;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    walked += seg;
  }
  const last = line[line.length - 1]!;
  return [last[0], last[1]];
}

/**
 * The part of a line between two fractions (`ST_LineSubstring`): the point at
 * f0, every original vertex strictly between, and the point at f1.
 */
export function substring(line: LonLat[], f0: number, f1: number): LonLat[] {
  const total = lineLength(line);
  const start = f0 * total;
  const end = f1 * total;
  const out: LonLat[] = [interpolate(line, f0)];
  let walked = 0;
  for (let i = 1; i < line.length - 1; i++) {
    walked += dist(line[i - 1]!, line[i]!);
    if (walked > start && walked < end) out.push([line[i]![0], line[i]![1]]);
  }
  out.push(interpolate(line, f1));
  return out;
}

/** Minimum distance in degrees between two segments. */
function segmentDistance(a: LonLat, b: LonLat, c: LonLat, d: LonLat): number {
  if (segmentIntersection(a, b, c, d)) return 0;
  return Math.min(
    closestOnSegmentDistance(a, c, d),
    closestOnSegmentDistance(b, c, d),
    closestOnSegmentDistance(c, a, b),
    closestOnSegmentDistance(d, a, b)
  );
}

function closestOnSegmentDistance(p: LonLat, a: LonLat, b: LonLat): number {
  return dist(closestOnSegment(p, a, b).point, p);
}

/** Minimum distance in degrees between two lines (`ST_Distance`). */
export function lineDistance(l1: LonLat[], l2: LonLat[]): number {
  let best = Infinity;
  for (let i = 1; i < l1.length; i++) {
    for (let j = 1; j < l2.length; j++) {
      best = Math.min(best, segmentDistance(l1[i - 1]!, l1[i]!, l2[j - 1]!, l2[j]!));
      if (best === 0) return 0;
    }
  }
  return best;
}

const cross = (o: LonLat, a: LonLat, b: LonLat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Whether two segments touch or cross. */
function segmentIntersection(a: LonLat, b: LonLat, c: LonLat, d: LonLat): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const onSeg = (p: LonLat, q: LonLat, r: LonLat) =>
    Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  return (d1 === 0 && onSeg(c, d, a)) || (d2 === 0 && onSeg(c, d, b))
    || (d3 === 0 && onSeg(a, b, c)) || (d4 === 0 && onSeg(a, b, d));
}

/**
 * The point parts of two lines' intersection (`ST_Intersection`, keeping only
 * POINTs): proper crossings and touching endpoints. Collinear overlaps are
 * line parts in PostGIS and are left out, as the SQL discards them.
 */
export function lineIntersectionPoints(l1: LonLat[], l2: LonLat[]): LonLat[] {
  const points = new Map<string, LonLat>();
  for (let i = 1; i < l1.length; i++) {
    for (let j = 1; j < l2.length; j++) {
      const a = l1[i - 1]!;
      const b = l1[i]!;
      const c = l2[j - 1]!;
      const d = l2[j]!;
      const denom = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (denom === 0) {
        // Parallel: collinear segments that meet only at a shared endpoint still touch at a point.
        if (cross(a, b, c) !== 0) continue;
        for (const p of [a, b]) {
          for (const q of [c, d]) {
            if (equals(p, q)) {
              const other1 = p === a ? b : a;
              const other2 = q === c ? d : c;
              const dot = (other1[0] - p[0]) * (other2[0] - p[0]) + (other1[1] - p[1]) * (other2[1] - p[1]);
              if (dot < 0) points.set(`${p[0]},${p[1]}`, [p[0], p[1]]); // pointing apart: one shared point
            }
          }
        }
        continue;
      }
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denom;
      const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denom;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      // Exact endpoints keep their exact coordinates.
      let p: LonLat;
      if (t === 0) p = a;
      else if (t === 1) p = b;
      else if (u === 0) p = c;
      else if (u === 1) p = d;
      else p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      points.set(`${p[0]},${p[1]}`, [p[0], p[1]]);
    }
  }
  return [...points.values()];
}

/** Round half to even, like C's `rint`. */
function rint(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** `ST_SnapToGrid(p, size)`. */
export function snapToGrid(p: LonLat, size: number): LonLat {
  return [rint(p[0] / size) * size, rint(p[1] / size) * size];
}

/**
 * Length of `line` that lies within `radius` degrees of any of `others`: the
 * length of the line inside the union of their round buffers. PostGIS builds
 * those buffers as polygons (8 segments per quarter circle); this measures the
 * true round buffer, so lengths can differ very slightly at the buffer's curved ends.
 */
export function lengthWithin(line: LonLat[], others: LonLat[][], radius: number): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const seg = dist(a, b);
    if (seg === 0) continue;
    const intervals: [number, number][] = [];
    for (const other of others) {
      for (let j = 1; j < other.length; j++) {
        const interval = withinInterval(a, b, other[j - 1]!, other[j]!, radius);
        if (interval) intervals.push(interval);
      }
      if (other.length === 1) {
        const interval = withinInterval(a, b, other[0]!, other[0]!, radius);
        if (interval) intervals.push(interval);
      }
    }
    total += covered(intervals) * seg;
  }
  return total;
}

/**
 * The parameter range [t0, t1] along a-b whose points are within `radius` of
 * segment c-d. Distance from a moving point to a segment is convex in t, so
 * the range is one interval: find the nearest t, then the crossings either side.
 */
function withinInterval(a: LonLat, b: LonLat, c: LonLat, d: LonLat, radius: number): [number, number] | undefined {
  const at = (t: number): LonLat => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  const f = (t: number) => closestOnSegmentDistance(at(t), c, d) - radius;
  // Ternary search for the minimum of a convex function.
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 100; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (f(m1) <= f(m2)) hi = m2;
    else lo = m1;
  }
  const tMin = (lo + hi) / 2;
  if (f(tMin) > 0) return undefined;
  const edge = (from: number, to: number) => {
    if (f(to) <= 0) return to;
    let inside = from;
    let outside = to;
    for (let k = 0; k < 100; k++) {
      const mid = (inside + outside) / 2;
      if (f(mid) <= 0) inside = mid;
      else outside = mid;
    }
    return inside;
  };
  return [edge(tMin, 0), edge(tMin, 1)];
}

/** Total length of the union of intervals within [0, 1]. */
function covered(intervals: [number, number][]): number {
  const sorted = intervals.map(([s, e]) => [Math.max(0, s), Math.min(1, e)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [s, e] of sorted) {
    if (e <= end) continue;
    total += e - Math.max(s, end);
    end = e;
  }
  return total;
}

/** PostgreSQL's float8 text output: shortest round-trip digits, exponent form below 1e-4 or from 1e15. */
export function pgFloatText(x: number): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  const abs = Math.abs(x);
  if (abs >= 1e-4 && abs < 1e15) return String(x);
  const [mantissa, exponent] = x.toExponential().split('e') as [string, string];
  const sign = exponent.startsWith('-') ? '-' : '+';
  const digits = exponent.replace(/^[+-]/, '').padStart(2, '0');
  return `${mantissa}e${sign}${digits}`;
}
