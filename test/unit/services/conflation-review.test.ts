import { describe, expect, it } from 'vitest';
import type { LonLat } from '~/services/conflation/geometry';
import { tileAt, tileBounds } from '~/services/conflation/inputs';
import { angleAround, aroundOrder, spiralTiles } from '~/services/conflation/review';

const CENTRE: LonLat = [-122.3, 47.6];
const step = 0.001;
const N: LonLat = [CENTRE[0], CENTRE[1] + step];
const E: LonLat = [CENTRE[0] + step, CENTRE[1]];
const S: LonLat = [CENTRE[0], CENTRE[1] - step];
const W: LonLat = [CENTRE[0] - step, CENTRE[1]];

describe('angleAround', () => {
  it('measures from north, increasing eastward clockwise and westward counterclockwise', () => {
    const cw = [N, E, S, W].map(p => angleAround(CENTRE, p, 'clockwise'));
    expect(cw[0]).toBeCloseTo(0);
    expect(cw).toEqual([...cw].sort((a, b) => a - b));
    const ccw = [N, W, S, E].map(p => angleAround(CENTRE, p, 'counterclockwise'));
    expect(ccw).toEqual([...ccw].sort((a, b) => a - b));
  });
});

describe('aroundOrder', () => {
  const order = (rotation: 'clockwise' | 'counterclockwise') =>
    [W, S, E, N].map((loc, i) => ({ id: `p${i}`, loc }))
      .sort(aroundOrder(CENTRE, rotation, p => p.loc, p => p.id))
      .map(p => p.loc);

  it('sweeps north, east, south, west clockwise', () => {
    expect(order('clockwise')).toEqual([N, E, S, W]);
  });

  it('sweeps north, west, south, east counterclockwise', () => {
    expect(order('counterclockwise')).toEqual([N, W, S, E]);
  });

  it('puts nearer points first at the same angle', () => {
    const far: LonLat = [CENTRE[0], CENTRE[1] + 2 * step];
    const sorted = [{ id: 'far', loc: far }, { id: 'near', loc: N }].sort(aroundOrder(CENTRE, 'clockwise', p => p.loc, p => p.id));
    expect(sorted.map(p => p.id)).toEqual(['near', 'far']);
  });
});

describe('spiralTiles', () => {
  const zoom = 16;
  const [cx, cy] = tileAt(CENTRE, zoom);
  // The centre tile and the 8 around it, plus one two rings out.
  const tiles: [number, number][] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.push([cx + dx, cy + dy]);
  tiles.push([cx + 2, cy]);
  // Spiral from the centre of the centre tile, so the ring of 8 is symmetric around it.
  const [w, s, e, n] = tileBounds([cx, cy], zoom);
  const middle: LonLat = [(w + e) / 2, (s + n) / 2];

  it('starts at the centre tile and works outward ring by ring', () => {
    const order = spiralTiles(tiles, middle, zoom, 'clockwise');
    expect(order[0]).toEqual([cx, cy]);
    expect(order.at(-1)).toEqual([cx + 2, cy]);
  });

  it('sweeps each ring from north, clockwise or counterclockwise', () => {
    const ring = (rotation: 'clockwise' | 'counterclockwise') => spiralTiles(tiles, middle, zoom, rotation).slice(1, 9);
    // Tile y grows southward: north is cy - 1.
    expect(ring('clockwise').slice(0, 3)).toEqual([[cx, cy - 1], [cx + 1, cy - 1], [cx + 1, cy]]);
    expect(ring('counterclockwise').slice(0, 3)).toEqual([[cx, cy - 1], [cx - 1, cy - 1], [cx - 1, cy]]);
  });
});
