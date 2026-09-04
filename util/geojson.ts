export function featureCollection(features: any[]) {
  return { type: 'FeatureCollection', features }
}

export function bboxToPolygon(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number
) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [minLon, minLat],
          [minLon, maxLat],
          [maxLon, maxLat],
          [maxLon, minLat],
          [minLon, minLat]
        ]
      ]
    }
  }
}
export function polygonToBbox(polygonGeometry: any): [number, number, number, number] {
  if (
    polygonGeometry.type !== 'Polygon'
    || !Array.isArray(polygonGeometry.coordinates)
    || polygonGeometry.coordinates.length === 0
  ) {
    throw new Error('Invalid GeoJSON Polygon feature')
  }

  const coordinates = polygonGeometry.coordinates[0]
  let minLat = Infinity
  let minLon = Infinity
  let maxLat = -Infinity
  let maxLon = -Infinity

  for (const [lon, lat] of coordinates) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }

  return [minLat, minLon, maxLat, maxLon]
}

function walkGeoJson(node: any, visitGeometry: (geometry: any) => void): void {
  if (!node || typeof node !== 'object') return

  switch (node.type) {
    case 'FeatureCollection':
      for (const feature of node.features ?? []) walkGeoJson(feature, visitGeometry)
      return
    case 'Feature':
      walkGeoJson(node.geometry, visitGeometry)
      return
    case 'GeometryCollection':
      for (const geometry of node.geometries ?? []) walkGeoJson(geometry, visitGeometry)
      return
    default:
      if (Array.isArray(node.coordinates)) visitGeometry(node)
  }
}

function extendBounds(bounds: [number, number, number, number], coordinates: any): void {
  if (
    Array.isArray(coordinates)
    && coordinates.length >= 2
    && typeof coordinates[0] === 'number'
    && typeof coordinates[1] === 'number'
  ) {
    const [lon, lat] = coordinates
    bounds[0] = Math.min(bounds[0], lon)
    bounds[1] = Math.min(bounds[1], lat)
    bounds[2] = Math.max(bounds[2], lon)
    bounds[3] = Math.max(bounds[3], lat)
    return
  }

  if (Array.isArray(coordinates)) {
    for (const item of coordinates) extendBounds(bounds, item)
  }
}

// Computes a [[minLng, minLat], [maxLng, maxLat]] bounding box for any GeoJSON
// shape (Feature, FeatureCollection, GeometryCollection, or a bare geometry of
// any type). Returns null if no coordinates are found.
export function getGeoJsonBounds(geojson: any): [[number, number], [number, number]] | null {
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]

  walkGeoJson(geojson, geometry => extendBounds(bounds, geometry.coordinates))

  if (!Number.isFinite(bounds[0])) {
    return null
  }

  return [[bounds[0], bounds[1]], [bounds[2], bounds[3]]]
}

export function shapeToCenter(shape: any) {
  if (shape.type === 'Polygon') {
    const bbox = polygonToBbox(shape)
    const centerLat = (bbox[0] + bbox[2]) / 2
    const centerLon = (bbox[1] + bbox[3]) / 2
    return [centerLat, centerLon]
  } else {
    throw new Error('Invalid GeoJSON Polygon feature')
  }
}
