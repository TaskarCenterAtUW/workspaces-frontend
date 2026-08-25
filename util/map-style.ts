// OpenStreetMap's own tile server now requires a Referrer header and isn't
// intended for production third-party use. OpenFreeMap hosts a free vector
// tile service built from OSM data instead; MapLibre GL fetches its full
// style (sources, layers, attribution) from this single URL.
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export interface MaplibreMapHandle {
  maplibregl: typeof import('maplibre-gl');
  map: import('maplibre-gl').Map;
  /** Resolves once the style has loaded and the map is ready for sources/layers. */
  ready: Promise<void>;
}

/**
 * Dynamically imports maplibre-gl and constructs a Map on the OpenFreeMap
 * style, with the NavigationControl every map component in this app uses.
 * Deferring the import keeps maplibre-gl's bundle out of a page's critical
 * path until a map component actually mounts.
 */
export async function createMaplibreMap(
  container: string | HTMLElement,
  options: {
    center: [number, number];
    zoom: number;
    controlPosition?: import('maplibre-gl').ControlPosition;
  }
): Promise<MaplibreMapHandle> {
  const maplibregl = await import('maplibre-gl');

  const map = new maplibregl.Map({
    container,
    style: OPENFREEMAP_STYLE_URL,
    center: options.center,
    zoom: options.zoom,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), options.controlPosition ?? 'top-right');

  const ready = new Promise<void>((resolve) => {
    map.on('load', () => resolve());
  });

  return { maplibregl, map, ready };
}
