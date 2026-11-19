import type { Feature, Polygon, Position } from 'geojson';

import { getProjectWizardAoiVertices } from '~/services/project-wizard-aoi';

import type {
  ProjectWizardAreaFeature,
  ProjectWizardGeneratedTaskFeature,
  ProjectWizardGeneratedTaskFeatureCollection,
  ProjectWizardTaskGenerationSummary,
  ProjectWizardTaskPreviewCellFeature,
  ProjectWizardTaskPreviewCellProperties,
  ProjectWizardTaskPreviewFeatureCollection,
} from '~/types/project-wizard';

const EARTH_RADIUS_METERS = 6_371_008.8;
const SQUARE_METERS_PER_SQUARE_KILOMETER = 1_000_000;
const SIMULATED_TASK_GENERATION_DELAY_MS = 320;

export const PROJECT_WIZARD_TASK_AREA_MINIMUM = 0.25;
export const PROJECT_WIZARD_TASK_AREA_MAXIMUM = 1;
export const PROJECT_WIZARD_TASK_AREA_DEFAULT = 0.45;
export const PROJECT_WIZARD_TASK_AREA_STEP = 0.05;

/**
 * Tasks smaller than this are slivers left where the grid is clipped by the project boundary.
 * Matches the warning threshold used by the HOT Tasking Manager.
 */
export const PROJECT_WIZARD_SMALL_TASK_AREA_THRESHOLD = 0.002;

export interface ProjectWizardSmallTaskPartition {
  /** Tasks at or above the threshold. */
  regularTasks: ProjectWizardGeneratedTaskFeature[];
  /** Tasks below the threshold. */
  smallTasks: ProjectWizardGeneratedTaskFeature[];
}

/**
 * Approximate area of a polygon (outer ring minus holes) in square kilometres, using a local
 * equirectangular projection centred on the polygon. Accurate to well under a percent at
 * task scale, which is all the small-task threshold needs.
 */
export function getPolygonAreaSquareKilometers(polygon: Polygon): number {
  const [outerRing, ...holes] = polygon.coordinates;

  if (!outerRing || outerRing.length < 4) {
    return 0;
  }

  const latitudeReferenceRadians = averageLatitudeRadians(outerRing);
  const ringArea = (ring: Position[]) =>
    projectedRingAreaSquareMeters(ring.map(coordinate => projectCoordinate(coordinate, latitudeReferenceRadians)));
  const areaSquareMeters = holes.reduce(
    (area, hole) => area - ringArea(hole),
    ringArea(outerRing),
  );

  return Math.max(0, areaSquareMeters) / SQUARE_METERS_PER_SQUARE_KILOMETER;
}

/** Split a generated task grid into tasks below and at-or-above the small-task threshold. */
export function partitionSmallTasks(
  taskGrid: ProjectWizardGeneratedTaskFeatureCollection | null,
  thresholdSquareKilometers = PROJECT_WIZARD_SMALL_TASK_AREA_THRESHOLD,
): ProjectWizardSmallTaskPartition {
  const partition: ProjectWizardSmallTaskPartition = { regularTasks: [], smallTasks: [] };

  for (const feature of taskGrid?.features ?? []) {
    if (feature.geometry.type !== 'Polygon') {
      continue;
    }

    const isSmall = getPolygonAreaSquareKilometers(feature.geometry) < thresholdSquareKilometers;
    (isSmall ? partition.smallTasks : partition.regularTasks).push(feature);
  }

  return partition;
}

export function convertTaskAreaSquareKilometersToCellSizeMeters(value: number): number {
  const normalizedArea = normalizeTaskAreaSquareKilometers(value);
  return Math.round(Math.sqrt(normalizedArea * SQUARE_METERS_PER_SQUARE_KILOMETER));
}

export function convertCellSizeMetersToSquareKilometers(value: number): number {
  return Number(((value * value) / SQUARE_METERS_PER_SQUARE_KILOMETER).toFixed(2));
}

interface ProjectWizardTaskGridModel {
  features: ProjectWizardTaskPreviewCellFeature[];
  totalTasks: number;
  taskAreaSquareKilometers: number;
}

interface ProjectWizardProjectedBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

type ProjectedCoordinate = readonly [number, number];

export function buildProjectWizardTaskPreviewFeatureCollection(
  aoi: ProjectWizardAreaFeature | null,
  requestedTaskAreaSquareKilometers: number,
): ProjectWizardTaskPreviewFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: buildProjectWizardTaskGridModel(aoi, requestedTaskAreaSquareKilometers).features,
  };
}

export function createProjectWizardTaskAoiSignature(aoi: ProjectWizardAreaFeature | null): string {
  return aoi ? JSON.stringify(aoi.geometry.coordinates) : '';
}

export function getProjectWizardTaskPreviewSummary(
  aoi: ProjectWizardAreaFeature | null,
  requestedTaskAreaSquareKilometers: number,
): Pick<ProjectWizardTaskGenerationSummary, 'approximateTaskAreaSquareKilometers' | 'totalTasks'> {
  const model = buildProjectWizardTaskGridModel(aoi, requestedTaskAreaSquareKilometers);

  return {
    totalTasks: model.totalTasks,
    approximateTaskAreaSquareKilometers: model.taskAreaSquareKilometers,
  };
}

export async function simulateProjectWizardTaskGeneration(
  aoi: ProjectWizardAreaFeature,
  requestedTaskAreaSquareKilometers: number,
): Promise<ProjectWizardTaskGenerationSummary> {
  await new Promise(resolve => setTimeout(resolve, SIMULATED_TASK_GENERATION_DELAY_MS));

  const model = buildProjectWizardTaskGridModel(aoi, requestedTaskAreaSquareKilometers);
  const taskGrid: ProjectWizardGeneratedTaskFeatureCollection = {
    type: 'FeatureCollection',
    features: model.features.filter(
      (feature): feature is Feature<Polygon, ProjectWizardTaskPreviewCellProperties> =>
        feature.geometry.type === 'Polygon',
    ),
  };

  return {
    aoiSignature: createProjectWizardTaskAoiSignature(aoi),
    approximateTaskAreaSquareKilometers: model.taskAreaSquareKilometers,
    generatedAt: new Date().toISOString(),
    requestedTaskAreaSquareKilometers: normalizeTaskAreaSquareKilometers(requestedTaskAreaSquareKilometers),
    taskGrid,
    totalTasks: model.totalTasks,
  };
}

export function normalizeTaskAreaSquareKilometers(value: number): number {
  const clampedValue = Math.min(PROJECT_WIZARD_TASK_AREA_MAXIMUM, Math.max(PROJECT_WIZARD_TASK_AREA_MINIMUM, value));
  const steppedValue = Math.round(clampedValue / PROJECT_WIZARD_TASK_AREA_STEP) * PROJECT_WIZARD_TASK_AREA_STEP;

  return Number(steppedValue.toFixed(2));
}

function buildProjectWizardTaskGridModel(
  aoi: ProjectWizardAreaFeature | null,
  requestedTaskAreaSquareKilometers: number,
): ProjectWizardTaskGridModel {
  const ring = getProjectWizardAoiVertices(aoi);

  if (ring.length < 3) {
    return {
      features: [],
      totalTasks: 0,
      taskAreaSquareKilometers: normalizeTaskAreaSquareKilometers(requestedTaskAreaSquareKilometers),
    };
  }

  const latitudeReferenceRadians = averageLatitudeRadians(ring);
  const projectedRing = ring.map(coordinate => projectCoordinate(coordinate, latitudeReferenceRadians));
  const bounds = getProjectedBounds(projectedRing);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  if (width <= 0 || height <= 0) {
    return {
      features: [],
      totalTasks: 0,
      taskAreaSquareKilometers: normalizeTaskAreaSquareKilometers(requestedTaskAreaSquareKilometers),
    };
  }

  const normalizedRequestedArea = normalizeTaskAreaSquareKilometers(requestedTaskAreaSquareKilometers);
  const targetAreaSquareMeters = normalizedRequestedArea * SQUARE_METERS_PER_SQUARE_KILOMETER;
  const targetSideMeters = Math.sqrt(targetAreaSquareMeters);
  const columnCount = Math.max(1, Math.ceil(width / targetSideMeters));
  const rowCount = Math.max(1, Math.ceil(height / targetSideMeters));
  const gridMaxX = bounds.minX + (columnCount * targetSideMeters);
  const gridMaxY = bounds.minY + (rowCount * targetSideMeters);
  const features: ProjectWizardTaskPreviewCellFeature[] = [];
  const gridFillPolygon = buildRectanglePolygon(
    bounds.minX,
    bounds.minY,
    gridMaxX,
    gridMaxY,
  ).map(coordinate => unprojectCoordinate(coordinate, latitudeReferenceRadians));

  features.push({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [gridFillPolygon],
    },
    properties: {
      approximateAreaSquareKilometers: normalizedRequestedArea,
      featureKind: 'grid-fill',
    },
  });

  for (let columnIndex = 0; columnIndex <= columnCount; columnIndex += 1) {
    const x = bounds.minX + (columnIndex * targetSideMeters);
    const verticalLine = [
      unprojectCoordinate([x, bounds.minY], latitudeReferenceRadians),
      unprojectCoordinate([x, gridMaxY], latitudeReferenceRadians),
    ];

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: verticalLine,
      },
      properties: {
        approximateAreaSquareKilometers: normalizedRequestedArea,
        featureKind: 'grid-line',
      },
    });
  }

  for (let rowIndex = 0; rowIndex <= rowCount; rowIndex += 1) {
    const y = bounds.minY + (rowIndex * targetSideMeters);
    const horizontalLine = [
      unprojectCoordinate([bounds.minX, y], latitudeReferenceRadians),
      unprojectCoordinate([gridMaxX, y], latitudeReferenceRadians),
    ];

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: horizontalLine,
      },
      properties: {
        approximateAreaSquareKilometers: normalizedRequestedArea,
        featureKind: 'grid-line',
      },
    });
  }

  return {
    features,
    totalTasks: rowCount * columnCount,
    taskAreaSquareKilometers: normalizedRequestedArea,
  };
}

function averageLatitudeRadians(ring: Position[]): number {
  return ring.reduce((sum, coordinate) => {
    const latitude = coordinate[1];

    if (latitude === undefined) {
      throw new Error('A coordinate requires a latitude value.');
    }

    return sum + toRadians(latitude);
  }, 0) / ring.length;
}

function buildRectanglePolygon(
  leftX: number,
  bottomY: number,
  rightX: number,
  topY: number,
): ProjectedCoordinate[] {
  return [
    [leftX, bottomY],
    [rightX, bottomY],
    [rightX, topY],
    [leftX, topY],
    [leftX, bottomY],
  ] as const;
}

function projectedRingAreaSquareMeters(ring: ProjectedCoordinate[]): number {
  let twiceArea = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]!;
    const [x2, y2] = ring[index + 1]!;
    twiceArea += (x1 * y2) - (x2 * y1);
  }

  return Math.abs(twiceArea) / 2;
}

function getProjectedBounds(projectedRing: ProjectedCoordinate[]): ProjectWizardProjectedBounds {
  // Callers only invoke this with a non-empty projected ring (ring.length >= 3 is checked upstream).
  const [firstX, firstY] = projectedRing[0]!;
  let minX = firstX;
  let maxX = firstX;
  let minY = firstY;
  let maxY = firstY;

  for (const [x, y] of projectedRing) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

function projectCoordinate(
  coordinate: Position,
  latitudeReferenceRadians: number,
): ProjectedCoordinate {
  const [longitude, latitude] = coordinate;

  if (longitude === undefined || latitude === undefined) {
    throw new Error('A projected coordinate requires both longitude and latitude.');
  }

  const x = EARTH_RADIUS_METERS * toRadians(longitude) * Math.cos(latitudeReferenceRadians);
  const y = EARTH_RADIUS_METERS * toRadians(latitude);

  return [x, y];
}

function unprojectCoordinate(
  coordinate: ProjectedCoordinate,
  latitudeReferenceRadians: number,
): Position {
  const [x, y] = coordinate;

  return [
    toDegrees(x / (EARTH_RADIUS_METERS * Math.cos(latitudeReferenceRadians))),
    toDegrees(y / EARTH_RADIUS_METERS),
  ];
}

function toDegrees(value: number): number {
  return value * (180 / Math.PI);
}

function toRadians(value: number): number {
  return value * (Math.PI / 180);
}
