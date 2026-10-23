import { describe, expect, it } from 'vitest';
import { getGeoJsonBounds, isValidGeoJsonBounds } from '~/util/geojson';

describe('GeoJSON bounds utilities', () => {
  it('accepts bounds calculated from longitude-latitude coordinates', () => {
    const datasetArea = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-120.3228517, 46.3678626],
            [-120.2938718, 46.3678626],
            [-120.2938718, 46.3896327],
            [-120.3228517, 46.3896327],
            [-120.3228517, 46.3678626],
          ]],
        },
      }],
    };

    const bounds = getGeoJsonBounds(datasetArea);

    expect(bounds).toEqual([
      [-120.3228517, 46.3678626],
      [-120.2938718, 46.3896327],
    ]);
    expect(bounds && isValidGeoJsonBounds(bounds)).toBe(true);
  });

  it('rejects bounds calculated from reversed latitude-longitude coordinates', () => {
    const datasetArea = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [46.3678626, -120.3228517],
            [46.3678626, -120.2938718],
            [46.3896327, -120.2938718],
            [46.3896327, -120.3228517],
            [46.3678626, -120.3228517],
          ]],
        },
      }],
    };

    const bounds = getGeoJsonBounds(datasetArea);

    expect(bounds).not.toBeNull();
    expect(bounds && isValidGeoJsonBounds(bounds)).toBe(false);
  });

  it('rejects non-finite, out-of-range, and inverted bounds', () => {
    expect(isValidGeoJsonBounds([[Number.NaN, 0], [1, 1]])).toBe(false);
    expect(isValidGeoJsonBounds([[-181, 0], [1, 1]])).toBe(false);
    expect(isValidGeoJsonBounds([[0, -91], [1, 1]])).toBe(false);
    expect(isValidGeoJsonBounds([[1, 1], [0, 0]])).toBe(false);
  });
});
