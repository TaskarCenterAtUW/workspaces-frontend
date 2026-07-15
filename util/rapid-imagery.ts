
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
{
    id: 'wa-tech',
    name: 'WA-Tech Imagery',
    type: 'wms', // or 'wms', 'bing', etc.
    template: 'https://waprovisoimg.centralindia.cloudapp.azure.com/arcgis/services/ImageServices/Statewide_2023_1ft_4band_wsps_83h_img/ImageServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox}&CRS={proj}&WIDTH={width}&HEIGHT={height}&LAYERS=Statewide_2023_1ft_4band_wsps_83h_img&STYLES=&FORMAT=image%2fpng&DPI=144&MAP_RESOLUTION=144&FORMAT_OPTIONS=dpi%3A144&TRANSPARENT=TRUE',
    projection: 'EPSG:3857',
    description: 'WA-Tech Imagery Source',
    zoomExtent: [12, 22], // Minimum and maximum available zoom levels
    overlay: false        // Set to true if it is a transparent layer (like street names)
}
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