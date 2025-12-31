export function featureCollection(features: Array) {
  return { type: 'FeatureCollection', features }
}

export function bboxToPolygon(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number,
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
          [minLon, minLat],
        ],
      ],
    },
  }
}
