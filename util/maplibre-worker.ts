// maplibre-gl 6 loads its worker from a separate file, which it can't find
// from inside Vite's module graph, so every map would stay blank. Import this
// module before constructing a map to point maplibre-gl at the worker.
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
