import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import {
  PROJECT_WIZARD_SMALL_TASK_AREA_THRESHOLD,
  getPolygonAreaSquareKilometers,
  partitionSmallTasks
} from '~/services/project-wizard-tasks';
import type { ProjectWizardGeneratedTaskFeatureCollection } from '~/types/project-wizard';

// One degree of latitude on the mean-radius sphere used by the projection, in metres.
const METERS_PER_DEGREE_LATITUDE = 111_195.08;

/** Build a square whose south-west corner is at (lon, lat). */
function square(lon: number, lat: number, sideMeters: number): Polygon {
  const dLat = sideMeters / METERS_PER_DEGREE_LATITUDE;
  const dLon = sideMeters / (METERS_PER_DEGREE_LATITUDE * Math.cos((lat + (dLat / 2)) * Math.PI / 180));

  return {
    type: 'Polygon',
    coordinates: [[
      [lon, lat],
      [lon + dLon, lat],
      [lon + dLon, lat + dLat],
      [lon, lat + dLat],
      [lon, lat]
    ]]
  };
}

function grid(...polygons: Polygon[]): ProjectWizardGeneratedTaskFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: polygons.map((geometry, index) => ({
      type: 'Feature',
      geometry,
      properties: { index }
    }))
  };
}

describe('getPolygonAreaSquareKilometers', () => {
  it('measures a 1 km square at mid latitude as about 1 km²', () => {
    expect(getPolygonAreaSquareKilometers(square(-122.3, 47.6, 1000))).toBeCloseTo(1, 2);
  });

  it('measures a 40 m square as about 0.0016 km²', () => {
    expect(getPolygonAreaSquareKilometers(square(-122.3, 47.6, 40))).toBeCloseTo(0.0016, 5);
  });

  it('subtracts holes from the outer ring', () => {
    const outer = square(-122.3, 47.6, 1000);
    const hole = square(-122.299, 47.601, 500);
    const withHole: Polygon = {
      type: 'Polygon',
      coordinates: [outer.coordinates[0]!, [...hole.coordinates[0]!].reverse()]
    };

    expect(getPolygonAreaSquareKilometers(withHole)).toBeCloseTo(0.75, 2);
  });

  it('returns 0 for a degenerate ring', () => {
    expect(getPolygonAreaSquareKilometers({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] })).toBe(0);
  });
});

describe('partitionSmallTasks', () => {
  it('uses the Tasking Manager threshold of 0.002 km²', () => {
    expect(PROJECT_WIZARD_SMALL_TASK_AREA_THRESHOLD).toBe(0.002);
  });

  it('separates tasks below the threshold from the rest', () => {
    const big = square(-122.3, 47.6, 670); // About 0.45 km²
    const sliver = square(-122.29, 47.6, 30); // About 0.0009 km²
    const justOver = square(-122.28, 47.6, 46); // About 0.0021 km²
    const result = partitionSmallTasks(grid(big, sliver, justOver));

    expect(result.smallTasks.map(feature => feature.properties?.index)).toEqual([1]);
    expect(result.regularTasks.map(feature => feature.properties?.index)).toEqual([0, 2]);
  });

  it('honours a custom threshold', () => {
    const result = partitionSmallTasks(grid(square(-122.3, 47.6, 670)), 1);

    expect(result.smallTasks).toHaveLength(1);
  });

  it('returns empty lists for a missing grid', () => {
    expect(partitionSmallTasks(null)).toEqual({ regularTasks: [], smallTasks: [] });
  });
});
