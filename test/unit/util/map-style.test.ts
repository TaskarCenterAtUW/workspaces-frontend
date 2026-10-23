import { describe, expect, it } from 'vitest';

import { bingImageryStyle } from '~/util/map-style';

describe('bingImageryStyle', () => {
  it('returns a separate style object per call', () => {
    // MapLibre keeps the stylesheet it is handed and mutates it in place. Two
    // components use this one, so a shared object lets the first map to load
    // corrupt the second's sources.
    const first = bingImageryStyle();
    const second = bingImageryStyle();

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.sources).not.toBe(first.sources);
    expect(second.sources.bing).not.toBe(first.sources.bing);
    expect(second.layers).not.toBe(first.layers);
  });
});
