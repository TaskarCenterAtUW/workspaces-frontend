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

const getWorkspaceBbox = vi.hoisted(() => vi.fn());
vi.mock('~/services/index', () => ({ workspacesClient: { getWorkspaceBbox } }));

// A workspace from 47 to 48 N, 123 to 122 W.
const extent = { min_lat: 47, min_lon: -123, max_lat: 48, max_lon: -122 };

/** A coverage index where a source covers only points inside its [minLon, minLat, maxLon, maxLat] box. */
function coverageOf(boxes: Record<string, [number, number, number, number]>) {
  return ([lon, lat]: [number, number]) => Object.entries(boxes)
    .filter(([, [w, s, e, n]]) => lon >= w && lon <= e && lat >= s && lat <= n)
    .map(([id]) => ({ id }));
}

const partial = { id: 'Downtown', template: 'https://downtown/{z}', props: { best: true, feature: {} } };
const whole = { id: 'County', template: 'https://county/{z}', props: { feature: {} } };
const worldwide = { id: 'Esri', template: 'https://esri/{z}', props: {} };
const boxes: Record<string, [number, number, number, number]> = {
  Downtown: [-122.6, 47.4, -122.4, 47.6],
  County: [-124, 46, -121, 49]
};

describe('chooseBackground with a workspace extent', () => {
  it('passes over imagery marked best that covers only part of the extent', () => {
    const imagery = fakeImagery([partial, whole, worldwide], null);
    imagery._whichPolygon = coverageOf(boxes);

    expect(chooseBackground(imagery, extent)?.id).toBe('County');
  });

  it('switches away from current imagery that covers only part of the extent', () => {
    const imagery = fakeImagery([partial, worldwide], partial);
    imagery._whichPolygon = coverageOf(boxes);

    expect(chooseBackground(imagery, extent)?.id).toBe('Esri');
  });

  it('keeps current imagery that covers the whole extent', () => {
    const imagery = fakeImagery([worldwide, whole], whole);
    imagery._whichPolygon = coverageOf(boxes);

    expect(chooseBackground(imagery, extent)?.id).toBe('County');
  });

  it('falls back to what covers the center when nothing covers the whole extent', () => {
    const imagery = fakeImagery([partial], null);
    imagery._whichPolygon = coverageOf(boxes);

    expect(chooseBackground(imagery, extent)?.id).toBe('Downtown');
  });

  it('reads coverage from Rapid 2, whose sources keep their fields directly', () => {
    const downtown = { id: 'Downtown', template: 'https://downtown/{z}', best: true };
    const bingV2 = { id: 'Bing', template: 'https://bing/{z}' };
    const imagery = fakeImagery([downtown, bingV2], null);
    imagery._imageryIndex = { query: coverageOf(boxes), features: new Map([['downtown', {}]]) };

    expect(chooseBackground(imagery, extent)?.id).toBe('Bing');
  });
});

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

  it('otherwise prefers the imagery marked best here, in either Rapid', () => {
    expect(chooseBackground(fakeImagery([bing, { ...kingCounty, best: true }], sfOrtho))?.id).toBe('King_County');
    expect(chooseBackground(fakeImagery([bing, { ...kingCounty, props: { best: true } }], sfOrtho))?.id).toBe('King_County');
  });

  it('keeps the current imagery over the imagery marked best', () => {
    const imagery = fakeImagery([bing, { ...kingCounty, best: true }], bing);

    expect(chooseBackground(imagery)).toBe(bing);
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

describe('chooseBackgroundForWorkspace with a workspace', () => {
  const contextFor = (imagery: RapidBackgroundImagery): RapidBackgroundContext => ({
    systems: { imagery },
    viewport: { centerLoc: () => [0, 0] },
    workspaceId: 7
  });

  it('chooses imagery covering the workspace\'s whole extent', async () => {
    getWorkspaceBbox.mockResolvedValueOnce(extent);
    const imagery = fakeImagery([partial, whole], partial);
    imagery._whichPolygon = coverageOf(boxes);

    await chooseBackgroundForWorkspace(contextFor(imagery));

    expect(getWorkspaceBbox).toHaveBeenCalledWith(7);
    expect(imagery.baseLayerSource).toHaveBeenCalledWith(whole);
  });

  it('still chooses by the center when the extent can\'t be fetched', async () => {
    getWorkspaceBbox.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const imagery = fakeImagery([partial, whole], partial);
    imagery._whichPolygon = coverageOf(boxes);

    await chooseBackgroundForWorkspace(contextFor(imagery));

    expect(imagery.baseLayerSource).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
