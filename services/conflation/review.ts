/**
 * The order suggestions are reviewed in: spiralling out from a centre point,
 * clockwise or counterclockwise.
 */
import type { LonLat } from '~/services/conflation/geometry';
import { tileAt, tileBounds } from '~/services/conflation/inputs';

export type Rotation = 'clockwise' | 'counterclockwise';

/**
 * The angle of a point around a centre, from north, turning the given way:
 * 0 at north, increasing toward east for clockwise (toward west for counterclockwise).
 */
export function angleAround(centre: LonLat, p: LonLat, rotation: Rotation): number {
  const dx = (p[0] - centre[0]) * Math.cos((centre[1] * Math.PI) / 180);
  const dy = p[1] - centre[1];
  if (dx === 0 && dy === 0) return 0;
  const clockwise = (Math.atan2(dx, dy) + 2 * Math.PI) % (2 * Math.PI);
  return rotation === 'clockwise' ? clockwise : (2 * Math.PI - clockwise) % (2 * Math.PI);
}

const distance = (centre: LonLat, p: LonLat) =>
  Math.hypot((p[0] - centre[0]) * Math.cos((centre[1] * Math.PI) / 180), p[1] - centre[1]);

/**
 * Tiles in spiral order around a centre: ring by ring outward from the
 * centre's tile (the tiles a step further away each time), each ring swept
 * by angle from north, the given way round.
 */
export function spiralTiles(tiles: [number, number][], centre: LonLat, zoom: number, rotation: Rotation): [number, number][] {
  const [cx, cy] = tileAt(centre, zoom);
  const middle = (xy: [number, number]): LonLat => {
    const [w, s, e, n] = tileBounds(xy, zoom);
    return [(w + e) / 2, (s + n) / 2];
  };
  const key = (xy: [number, number]) => ({
    ring: Math.max(Math.abs(xy[0] - cx), Math.abs(xy[1] - cy)),
    angle: angleAround(centre, middle(xy), rotation)
  });
  return tiles
    .map(xy => ({ xy, ...key(xy) }))
    .sort((a, b) => a.ring - b.ring || a.angle - b.angle || a.xy[1] - b.xy[1] || a.xy[0] - b.xy[0])
    .map(t => t.xy);
}

/**
 * Orders points around a centre the given way round: by angle from north,
 * then nearer first, then by id.
 */
export function aroundOrder<T>(centre: LonLat, rotation: Rotation, locOf: (item: T) => LonLat, idOf: (item: T) => string) {
  return (a: T, b: T): number => {
    const [pa, pb] = [locOf(a), locOf(b)];
    const [ia, ib] = [idOf(a), idOf(b)];
    return angleAround(centre, pa, rotation) - angleAround(centre, pb, rotation)
      || distance(centre, pa) - distance(centre, pb)
      || (ia < ib ? -1 : ia > ib ? 1 : 0);
  };
}
