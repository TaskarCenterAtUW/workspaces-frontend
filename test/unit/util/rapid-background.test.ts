import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseBackground, chooseBackgroundForWorkspace } from '~/util/rapid-background';

import type { RapidBackgroundContext, RapidBackgroundImagery, RapidBackgroundSource } from '~/util/rapid-background';

const bing: RapidBackgroundSource = { id: 'Bing', template: 'https://bing/{z}' };
const esri: RapidBackgroundSource = { id: 'EsriWorldImagery', template: 'https://esri/{z}' };
const sfOrtho: RapidBackgroundSource = { id: 'SF_Ortho', template: 'https://sf/{z}' };
const kingCounty: RapidBackgroundSource = { id: 'King_County', template: 'https://kc/{z}' };

/**
 * An imagery system covering `here` and showing `current`. Like Rapid's,
 * `visibleSources` always includes the current imagery.
 */
function fakeImagery(here: RapidBackgroundSource[], current: RapidBackgroundSource | null): RapidBackgroundImagery {
  const imagery: RapidBackgroundImagery = {
    _baseLayer: current,
    visibleSources: () => {
      const base = imagery._baseLayer;
      return base && !here.includes(base) ? [base, ...here] : here;
    },
    baseLayerSource: vi.fn((source: RapidBackgroundSource) => {
      imagery._baseLayer = source;
    })
  };
  return imagery;
}

describe('chooseBackground', () => {
  it('keeps the current imagery where it has coverage', () => {
    const imagery = fakeImagery([bing, esri, sfOrtho], sfOrtho);

    expect(chooseBackground(imagery)).toBe(sfOrtho);
    expect(imagery._baseLayer).toBe(sfOrtho);
  });

  it('switches away from imagery that has no coverage here', () => {
    const imagery = fakeImagery([bing, esri, kingCounty], sfOrtho);

    expect(chooseBackground(imagery)).toBe(bing);
    expect(imagery._baseLayer).toBe(sfOrtho);
  });

  it('prefers the imagery marked best here, in either Rapid', () => {
    expect(chooseBackground(fakeImagery([bing, { ...kingCounty, best: true }], sfOrtho))?.id).toBe('King_County');
    expect(chooseBackground(fakeImagery([bing, { ...kingCounty, props: { best: true } }], bing))?.id).toBe('King_County');
  });

  it('skips overlays, none and an empty custom source', () => {
    const imagery = fakeImagery([
      { id: 'none' },
      { id: 'custom', template: '' },
      { id: 'labels', overlay: true },
      { id: 'streets', props: { overlay: true } },
      esri
    ], sfOrtho);

    expect(chooseBackground(imagery)).toBe(esri);
  });
});

describe('chooseBackgroundForWorkspace', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  function fakeContext(imagery: RapidBackgroundImagery, center: () => [number, number]): RapidBackgroundContext {
    return { systems: { imagery }, viewport: { centerLoc: center } };
  }

  it('waits for the map to reach the URL location before choosing', async () => {
    window.location.hash = '#map=17.00/47.6/-122.3';
    let centers = 0;
    const imagery = fakeImagery([bing], sfOrtho);
    const visibleSources = vi.spyOn(imagery, 'visibleSources');
    const context = fakeContext(imagery, () => (++centers < 3 ? [-122.4, 37.7] : [-122.3, 47.6]));

    await chooseBackgroundForWorkspace(context);

    expect(centers).toBe(3);
    expect(visibleSources).toHaveBeenCalledTimes(1);
    expect(imagery.baseLayerSource).toHaveBeenCalledWith(bing);
  });

  it('leaves imagery that covers the workspace alone', async () => {
    window.location.hash = '#map=17.00/47.6/-122.3';
    const imagery = fakeImagery([bing, kingCounty], kingCounty);

    await chooseBackgroundForWorkspace(fakeContext(imagery, () => [-122.3, 47.6]));

    expect(imagery.baseLayerSource).not.toHaveBeenCalled();
  });

  it('lets the editor open when Rapid lacks what it needs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const context = { systems: { imagery: {} }, viewport: {} } as unknown as RapidBackgroundContext;

    await expect(chooseBackgroundForWorkspace(context)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
