
export function featureCollection(features: Array) {
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

export function polygonToBbox(polygonGeometry: any) {
  if (
    polygonGeometry.type !== 'Polygon' ||
    !Array.isArray(polygonGeometry.coordinates) ||
    polygonGeometry.coordinates.length === 0
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
