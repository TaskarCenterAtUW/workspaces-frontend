
/**
 * 
 * @param customImagerySource 
 * Input
 * {
    "id": "osm-standard",
    "url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "icon": "https://www.openstreetmap.org/assets/osm_logo-4b074077c29e100f40ee64f5177886e36b570d4cc3ab10c7b263003d09642e3f.svg",
    "name": "OpenStreetMap Standard",
    "type": "xyz",
    "extent": {
        "polygon": [
            [
                [
                    -180,
                    -85.0511
                ],
                [
                    180,
                    -85.0511
                ],
                [
                    180,
                    85.0511
                ],
                [
                    -180,
                    85.0511
                ],
                [
                    -180,
                    -85.0511
                ]
            ]
        ],
        "max_zoom": 19
    },
    "attribution": {
        "url": "https://www.openstreetmap.org/copyright",
        "text": "© OpenStreetMap contributors",
        "required": true
    },
    "description": "OpenStreetMap standard"
}
 * @returns Rapid Custom Imagery level json object
 */


export function convertToRapidImagerySource(customImagerySource: Record<string, unknown> | null): any {
  if (!customImagerySource) {
    return null;
  }
  // this is the bare minimum required configuration.
  // Has to be done better.
  return {
    id: customImagerySource.id,
    name: customImagerySource.name,
    // type: customImagerySource.type,
    template: customImagerySource.url,
    projection: 'EPSG:3857', // Assuming EPSG:3857 for WMS sources; adjust if necessary
    description: customImagerySource.description,
    zoomExtent: [customImagerySource.extent?.min_zoom || 12, customImagerySource.extent?.max_zoom || 22], // Default zoom levels if not provided
    overlay: false, // Set to true if it is a transparent layer (like street names); adjust based on your needs
  };
}