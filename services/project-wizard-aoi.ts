import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson';

import type { ProjectWizardAreaFeature } from '~/types/project-wizard';

const EARTH_RADIUS_METERS = 6_371_008.8;
const MINIMUM_RING_VERTEX_COUNT = 3;

export type Coordinate = [number, number];

export interface ProjectWizardAoiImportResult {
  areaSquareKilometers: number;
  feature: ProjectWizardAreaFeature;
}

type ProjectWizardPolygonInput =
  | Polygon
  | MultiPolygon
  | Feature<Polygon | MultiPolygon, GeoJsonProperties>
  | FeatureCollection<Geometry, GeoJsonProperties>;

export function parseProjectWizardAoiFileContent(content: string): ProjectWizardAoiImportResult {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(content) as unknown;
  }
  catch {
    throw new Error('Upload a valid JSON file.');
  }

  return normalizeProjectWizardAoiInput(parsedValue);
}

export function normalizeProjectWizardAoiInput(input: unknown): ProjectWizardAoiImportResult {
  const feature = normalizeProjectWizardAoiFeature(extractPolygonFeature(input));

  return {
    feature,
    areaSquareKilometers: calculateProjectWizardAoiAreaSquareKilometers(feature),
  };
}

export function normalizeProjectWizardAoiFeature(feature: ProjectWizardAreaFeature): ProjectWizardAreaFeature {
  const ring = normalizePolygonRing(feature.geometry.coordinates[0] ?? []);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
    properties: feature.properties ?? {},
  };
}

export function buildProjectWizardAoiFeatureFromVertices(vertices: Position[]): ProjectWizardAreaFeature | null {
  const normalizedVertices = normalizeEditableVertices(vertices);

  if (normalizedVertices.length < MINIMUM_RING_VERTEX_COUNT) {
    return null;
  }

  const closedRing = closePolygonRing(normalizedVertices);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [closedRing],
    },
    properties: {},
  };
}

export function getProjectWizardAoiVertices(feature: ProjectWizardAreaFeature | null): Coordinate[] {
  if (!feature) {
    return [];
  }

  const ring = feature.geometry.coordinates[0] ?? [];

  return normalizeEditableVertices(ring);
}

export function calculateProjectWizardAoiAreaSquareKilometers(feature: ProjectWizardAreaFeature): number {
  const ring = normalizeEditableVertices(feature.geometry.coordinates[0] ?? []);

  if (ring.length < MINIMUM_RING_VERTEX_COUNT) {
    return 0;
  }

  const latitudeReferenceRadians = averageLatitudeRadians(ring);
  const projectedCoordinates = ring.map(([longitude, latitude]) => {
    const x = EARTH_RADIUS_METERS * toRadians(longitude) * Math.cos(latitudeReferenceRadians);
    const y = EARTH_RADIUS_METERS * toRadians(latitude);

    return [x, y] as const;
  });

  let shoelaceSum = 0;

  for (let index = 0; index < projectedCoordinates.length; index += 1) {
    // index and the modulo of the length always stay within bounds here.
    const [x1, y1] = projectedCoordinates[index]!;
    const [x2, y2] = projectedCoordinates[(index + 1) % projectedCoordinates.length]!;
    shoelaceSum += (x1 * y2) - (x2 * y1);
  }

  return Math.abs(shoelaceSum) / 2 / 1_000_000;
}

export function getProjectWizardAoiBounds(feature: ProjectWizardAreaFeature | null): [[number, number], [number, number]] | null {
  const vertices = getProjectWizardAoiVertices(feature);

  if (vertices.length === 0) {
    return null;
  }

  // The zero-length case returned above, so the first vertex exists.
  const [firstLongitude, firstLatitude] = vertices[0]!;
  let minLongitude = firstLongitude;
  let maxLongitude = firstLongitude;
  let minLatitude = firstLatitude;
  let maxLatitude = firstLatitude;

  for (const [longitude, latitude] of vertices) {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }

  return [
    [minLongitude, minLatitude],
    [maxLongitude, maxLatitude],
  ];
}

function extractPolygonFeature(input: unknown): ProjectWizardAreaFeature {
  const nestedFeature = extractPolygonFeatureCandidate(input);

  if (nestedFeature) {
    return nestedFeature;
  }

  throw new Error('Upload a valid JSON file containing polygon geometry.');
}

function extractPolygonFeatureCandidate(input: unknown, visited = new WeakSet<object>()): ProjectWizardAreaFeature | null {
  if (!input || typeof input !== 'object') {
    return extractPolygonFeatureFromCoordinates(input);
  }

  if (visited.has(input)) {
    return null;
  }

  visited.add(input);

  const geoJsonInput = input as ProjectWizardPolygonInput;
  const recordInput = input as Record<string, unknown>;

  if ('type' in geoJsonInput && geoJsonInput.type === 'FeatureCollection') {
    const candidateFeature = geoJsonInput.features.find(feature =>
      isPolygonGeometry(feature.geometry),
    );

    if (!candidateFeature || !isPolygonGeometry(candidateFeature.geometry)) {
      return searchNestedPolygonFeature(geoJsonInput.features, visited);
    }

    return polygonFeatureFromGeometry(candidateFeature.geometry, candidateFeature.properties ?? {});
  }

  if ('type' in geoJsonInput && geoJsonInput.type === 'Feature') {
    return polygonFeatureFromGeometry(geoJsonInput.geometry, geoJsonInput.properties ?? {});
  }

  if ('type' in geoJsonInput && (geoJsonInput.type === 'Polygon' || geoJsonInput.type === 'MultiPolygon')) {
    return polygonFeatureFromGeometry(geoJsonInput, {});
  }

  if ('geometry' in recordInput && recordInput.geometry && typeof recordInput.geometry === 'object') {
    const geometryFeature = extractPolygonFeatureCandidate(recordInput.geometry, visited);

    if (geometryFeature) {
      return geometryFeature;
    }
  }

  if ('coordinates' in recordInput) {
    const coordinatesFeature = extractPolygonFeatureFromCoordinates(recordInput.coordinates);

    if (coordinatesFeature) {
      return coordinatesFeature;
    }
  }

  return searchNestedPolygonFeature(Object.values(recordInput), visited);
}

function isPolygonGeometry(geometry: Geometry | null | undefined): geometry is Polygon | MultiPolygon {
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

function polygonFeatureFromGeometry(
  geometry: Polygon | MultiPolygon | null,
  properties: GeoJsonProperties,
): ProjectWizardAreaFeature {
  if (!geometry) {
    throw new Error('The uploaded GeoJSON feature is missing geometry.');
  }

  switch (geometry.type) {
    case 'Polygon':
      return {
        type: 'Feature',
        geometry,
        properties: properties ?? {},
      };

    case 'MultiPolygon': {
      const exteriorRings = geometry.coordinates
        .map(polygon => polygon[0] ?? [])
        .filter(ring => ring.length >= 4);

      if (exteriorRings.length === 0) {
        throw new Error('The uploaded MultiPolygon does not contain a usable exterior ring.');
      }

      const largestRing = exteriorRings
        .map(ring => ({
          ring,
          area: calculateRingAreaSquareKilometers(ring),
        }))
        .sort((left, right) => right.area - left.area)[0]?.ring;

      if (!largestRing) {
        throw new Error('The uploaded MultiPolygon does not contain a usable exterior ring.');
      }

      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [largestRing],
        },
        properties: properties ?? {},
      };
    }

    default:
      throw new Error('Upload a valid JSON file containing polygon geometry.');
  }
}

function searchNestedPolygonFeature(values: unknown[], visited: WeakSet<object>): ProjectWizardAreaFeature | null {
  for (const value of values) {
    const nestedFeature = extractPolygonFeatureCandidate(value, visited);

    if (nestedFeature) {
      return nestedFeature;
    }
  }

  return null;
}

function extractPolygonFeatureFromCoordinates(input: unknown): ProjectWizardAreaFeature | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }

  const polygonCoordinates = normalizePolygonCoordinates(input);

  if (!polygonCoordinates) {
    return null;
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [polygonCoordinates],
    },
    properties: {},
  };
}

function normalizePolygonCoordinates(input: unknown): Position[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }

  if (isPositionArray(input)) {
    return input.map(position => [Number(position[0]), Number(position[1])]);
  }

  const firstItem = input[0];

  if (Array.isArray(firstItem) && isPositionArray(firstItem)) {
    return firstItem.map(position => [Number(position[0]), Number(position[1])]);
  }

  if (Array.isArray(firstItem) && Array.isArray(firstItem[0]) && isPositionArray(firstItem[0])) {
    return firstItem[0].map(position => [Number(position[0]), Number(position[1])]);
  }

  return null;
}

function isPositionArray(value: unknown): value is Position[] {
  return Array.isArray(value) && value.every(isPosition);
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function normalizePolygonRing(ring: Position[]): Position[] {
  const editableVertices = normalizeEditableVertices(ring);

  if (editableVertices.length < MINIMUM_RING_VERTEX_COUNT) {
    throw new Error('The uploaded polygon must contain at least three points.');
  }

  return closePolygonRing(editableVertices);
}

function normalizeEditableVertices(vertices: Position[]): Coordinate[] {
  const sanitizedVertices = vertices
    .map(normalizePosition)
    .filter((vertex): vertex is Coordinate => vertex !== null);

  if (sanitizedVertices.length <= 1) {
    return sanitizedVertices;
  }

  // Length exceeds one here, so both the first and last vertices exist.
  const firstVertex = sanitizedVertices[0]!;
  const lastVertex = sanitizedVertices[sanitizedVertices.length - 1]!;

  if (positionsEqual(firstVertex, lastVertex)) {
    return sanitizedVertices.slice(0, -1);
  }

  return sanitizedVertices;
}

function closePolygonRing(vertices: Coordinate[]): Coordinate[] {
  // Every caller guards a non-empty ring before closing it.
  const firstVertex = vertices[0]!;

  return [...vertices, [firstVertex[0], firstVertex[1]]];
}

function normalizePosition(position: Position): Coordinate | null {
  const [longitude, latitude] = position;

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return [Number(longitude), Number(latitude)];
}

function positionsEqual(left: Position, right: Position): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function averageLatitudeRadians(vertices: Coordinate[]): number {
  const latitudeSum = vertices.reduce((sum, [, latitude]) => sum + latitude, 0);

  return toRadians(latitudeSum / vertices.length);
}

function calculateRingAreaSquareKilometers(ring: Position[]): number {
  return calculateProjectWizardAoiAreaSquareKilometers({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [closePolygonRing(normalizeEditableVertices(ring))],
    },
    properties: {},
  });
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
