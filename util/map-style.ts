// OpenStreetMap's own tile server now requires a Referrer header and isn't
// intended for production third-party use. OpenFreeMap hosts a free vector
// tile service built from OSM data instead; MapLibre GL fetches its full
// style (sources, layers, attribution) from this single URL.
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
