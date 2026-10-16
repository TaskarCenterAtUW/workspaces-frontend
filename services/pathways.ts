import {
  BlobReader,
  BlobWriter,
  TextWriter,
  ZipReader
} from '@zip.js/zip.js';

import { parseCsv } from '~/util/csv';
import { createEmptyGtfsDataset, createGtfsArchive } from '~/util/gtfs';
import * as xml from '~/util/xml';
import type { TdeiAuthStore } from '~/services/tdei';

/** A string-keyed column map with a helper to blank every value between rows. */
type ResettableMap = Map<string, string> & { reset: () => void };

const CHANGESET_FILE = 'changeset';

const PATHWAYS_FILES = new Set([
  'levels.txt',
  'pathways.txt',
  'stops.txt'
]);

export async function openTdeiPathwaysArchive(
  zip: Blob,
  parseObjects: boolean = true,
  filterPathways: boolean = true
) {
  const blobReader = new BlobReader(zip);
  const zipReader = new ZipReader(blobReader);
  let entries = await zipReader.getEntries();

  // if we are opening a TDEI archive then entries are zipped up,
  // otherwise the legacy Workspaces archive has everything in a single directory
  for (const x of entries) {
    if (!x.directory && !x.filename.startsWith(CHANGESET_FILE) && x.filename.endsWith('.zip')) {
      const subzipBlob = await x.getData(new BlobWriter());
      const subzipFileReader = new BlobReader(subzipBlob);
      const subzipReader = new ZipReader(subzipFileReader);
      entries = await subzipReader.getEntries();
      break;
    }
  }

  const filePromises = [];

  for (const e of entries) {
    if (e.directory) continue;
    if (!filterPathways || PATHWAYS_FILES.has(e.filename)) {
      const textWriter = new TextWriter();

      filePromises.push((async (): Promise<[string, any]> => {
        const csv = await e.getData(textWriter);

        if (parseObjects) {
          return [e.filename, await parseCsv(csv)];
        } else {
          return [e.filename, csv];
        }
      })());
    }
  }

  const map = new Map(await Promise.all(filePromises));

  return map;
}

export function pathways2osc(changesetId: number, dataset: Map<string, any[]>) {
  const oscDoc = xml.parse(
    '<osmChange version="0.6"><create /><modify /><delete /></osmChange>'
  );
  const createNode = oscDoc.firstChild!.firstChild!;
  const stopNodeIdMap = new Map();
  let currentId = -1;

  for (const stop of dataset.get('stops.txt') ?? []) {
    const node = xml.makeNode(oscDoc, 'node', {
      id: currentId,
      changeset: changesetId,
      version: 1,
      lat: stop.stop_lat.trim(),
      lon: stop.stop_lon.trim()
    });

    for (const [k, v] of Object.entries(stop)) {
      if (k !== 'stop_lat' && k !== 'stop_lon') {
        node.appendChild(xml.makeNode(oscDoc, 'tag', { k, v }));
      }
    }

    stopNodeIdMap.set(stop.stop_id, currentId);
    createNode.appendChild(node);
    currentId--;
  }

  for (const pathway of dataset.get('pathways.txt') ?? []) {
    const way = xml.makeNode(oscDoc, 'way', {
      id: currentId,
      changeset: changesetId,
      version: 1
    });

    way.appendChild(xml.makeNode(oscDoc, 'nd', {
      ref: stopNodeIdMap.get(pathway.from_stop_id)
    }));
    way.appendChild(xml.makeNode(oscDoc, 'nd', {
      ref: stopNodeIdMap.get(pathway.to_stop_id)
    }));

    for (const [k, v] of Object.entries(pathway)) {
      way.appendChild(xml.makeNode(oscDoc, 'tag', { k, v }));
    }

    createNode.appendChild(way);
    currentId--;
  }

  return xml.serialize(oscDoc);
}

function makeStopColumnMap(): ResettableMap {
  const map = new Map([
    ['stop_id', ''],
    ['stop_name', ''],
    ['stop_lat', ''],
    ['stop_lon', ''],
    ['location_type', ''],
  ]) as ResettableMap;

  map.reset = () => {
    map.forEach((_val, key) => {
      map.set(key, '');
    });
  }

  return map;
}

function makePathwayColumnMap(): ResettableMap {
  const map = new Map([
    ['pathway_id', ''],
    ['from_stop_id', ''],
    ['to_stop_id', ''],
    ['pathway_mode', ''],
    ['is_bidirectional', ''],
  ]) as ResettableMap;

  map.reset = () => {
    map.forEach((_val, key) => {
      map.set(key, '');
    });
  }

  return map;
}

// Prefixes for GTFS IDs generated from OSM element IDs, so they can't collide
// with an agency's own (often numeric) IDs and are recognizable in the feed.
export const GENERATED_STOP_ID_PREFIX = 'ws-n';
export const GENERATED_PATHWAY_ID_PREFIX = 'ws-w';

/**
 * Picks a unique GTFS ID for each element, keyed by OSM element ID.
 *
 * An element keeps the ID in its `idTag` tag (as imported from GTFS) so that
 * other files in the feed, e.g. stop_times.txt, still resolve. Elements without
 * one (drawn in the editor), or whose tag duplicates an earlier element's (e.g.
 * copy-pasted), get `prefix` + their OSM ID instead.
 */
function assignGtfsIds(elements: any[], idTag: string, prefix: string): Map<number, string> {
  const ids = new Map<number, string>();
  const used = new Set<string>();
  const needsId: any[] = [];

  // Tagged IDs first, so a generated ID can never take one an element already has.
  for (const element of elements) {
    const tagged = String(element.tags?.[idTag] ?? '').trim();
    if (tagged && !used.has(tagged)) {
      ids.set(element.id, tagged);
      used.add(tagged);
    } else {
      needsId.push(element);
    }
  }

  for (const element of needsId) {
    let generated = `${prefix}${element.id}`;
    for (let n = 2; used.has(generated); n++) {
      generated = `${prefix}${element.id}-${n}`;
    }
    ids.set(element.id, generated);
    used.add(generated);
  }

  return ids;
}

export async function buildPathwaysCsvArchive(elements: any[], gtfsFiles?: Map<string, string>): Promise<Blob> {
  if (!gtfsFiles) {
    gtfsFiles = createEmptyGtfsDataset();
  }

  let stopsCsv = 'stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,level_id\n';
  let pathwaysCsv = 'pathway_id,from_stop_id,to_stop_id,pathway_mode,is_bidirectional\n';

  const nodes = elements.filter(element => element.type === 'node');
  const ways = elements.filter(element => element.type === 'way');

  const stopIds = assignGtfsIds(nodes, 'stop_id', GENERATED_STOP_ID_PREFIX);
  const pathwayIds = assignGtfsIds(ways, 'pathway_id', GENERATED_PATHWAY_ID_PREFIX);

  const stopColumnMap = makeStopColumnMap();
  const pathwayColumnMap = makePathwayColumnMap();

  for (const element of nodes) {
    const tags = element.tags ?? {};

    stopColumnMap.reset();
    stopColumnMap.set('stop_id', stopIds.get(element.id)!);
    stopColumnMap.set('stop_lat', element.lat);
    stopColumnMap.set('stop_lon', element.lon);
    stopColumnMap.set('stop_name', tags.stop_name);
    stopColumnMap.set('location_type', tags.location_type);
    stopColumnMap.set('parent_station', tags.parent_station);
    stopColumnMap.set('level_id', tags.level_id);

    stopsCsv += Array.from(stopColumnMap.values()).join(',');
    stopsCsv += '\n';
  }

  for (const element of ways) {
    const tags = element.tags ?? {};

    pathwayColumnMap.reset();
    pathwayColumnMap.set('pathway_id', pathwayIds.get(element.id)!);
    pathwayColumnMap.set('from_stop_id', stopIds.get(element.nodes[0]) ?? '');
    pathwayColumnMap.set('to_stop_id', stopIds.get(element.nodes[1]) ?? '');
    pathwayColumnMap.set('pathway_mode', tags.pathway_mode);
    pathwayColumnMap.set('is_bidirectional', tags.is_bidirectional);

    pathwaysCsv += Array.from(pathwayColumnMap.values()).join(',');
    pathwaysCsv += '\n';
  }

  gtfsFiles.set('pathways.txt', pathwaysCsv);
  gtfsFiles.set('stops.txt', stopsCsv);

  return await createGtfsArchive(gtfsFiles);
}

export class PathwaysEditorManager {
  #baseUrl: string;
  #osmUrl: string;
  #tdeiAuth: TdeiAuthStore;

  /** Reactive flag indicating whether the editor script has loaded and is ready. */
  loaded: ReturnType<typeof ref<boolean>>;

  /** The DOM element that the editor mounts into. */
  containerNode: HTMLDivElement;

  /** The iD editor context instance, available after loading completes. */
  editorContext: any;

  constructor(baseUrl: string, osmUrl: string, tdeiAuth: TdeiAuthStore) {
    this.#baseUrl = baseUrl;
    this.#osmUrl = osmUrl.replace(/\/+$/, '');
    this.#tdeiAuth = tdeiAuth;

    this.loaded = ref(false);
    this.containerNode = document.createElement('div');
    this.editorContext = null;
  }

  load() {
    if (this.loaded.value) {
      return
    }

    const style = document.createElement('link');
    style.setAttribute('href', this.#baseUrl + 'iD.css');
    style.setAttribute('type', 'text/css');
    style.setAttribute('rel', 'stylesheet');
    document.head.appendChild(style);

    const script = document.createElement('script');
    script.src = this.#baseUrl + 'iD.js';
    script.async = true;
    script.onload = this.#onLoaded.bind(this);
    document.body.appendChild(script);
  }

  init(workspaceId: number) {
    const osmConnection = { url: this.#osmUrl, apiUrl: this.#osmUrl };

    this.editorContext.workspaceId = workspaceId;
    this.editorContext.connection().apiConnections([osmConnection]);
    this.editorContext.init();
    this.editorContext.connection().switch(osmConnection);
    this.#patchEditor();

    return Promise.resolve();
  }

  switchWorkspace(workspaceId: number) {
    this.editorContext.workspaceId = workspaceId;

    // Induce the editor to re-read the configuration from the URL hash:
    window.dispatchEvent(new HashChangeEvent('hashchange', {
      newURL: window.location.href,
      oldURL: window.location.href
    }));

    this.editorContext.reset();

    return Promise.resolve();
  }

  #onLoaded() {
    this.loaded.value = true;

    this.editorContext = window.iD.coreContext();
    this.editorContext.embed(true);
    this.editorContext.containerNode(this.containerNode);
    this.editorContext.assetPath(this.#baseUrl);
    this.editorContext.setsDocumentTitle(false);

    console.info('Pathways editor loaded', window.iD);
  }

  #patchEditor() {
    const pathwaysOsmService = this.editorContext.connection();
    const pathwaysOsmClient = pathwaysOsmService.oauthClient;

    pathwaysOsmClient.xhr = this.#wrapXhr(pathwaysOsmClient.xhr);
    pathwaysOsmClient.authenticated = () => this.#tdeiAuth.ok;

    // Don't bother to fetch user details when uploading changesets:
    pathwaysOsmService.userDetails = (callback: (err: string) => void) => {
      callback('dummy error')
    };
  }

  #wrapXhr(innerXhr: (options: any, callback: any) => any) {
    return (options: any, callback: any) => {
      if (!options.headers) {
        options.headers = {};
      }

      const tokenHeader = 'Bearer ' + this.#tdeiAuth.accessToken;

      if (options.headers instanceof Headers) {
        options.headers.set('X-Workspace', this.editorContext.workspaceId);
        options.headers.set('Authorization', tokenHeader);
      } else if (options.headers instanceof Array) {
        options.headers.push(['X-Workspace', this.editorContext.workspaceId]);
        options.headers.push('Authorization', tokenHeader);
      } else {
        options.headers['X-Workspace'] = this.editorContext.workspaceId;

        // Don't let osm-auth overwrite our auth header:
        Object.defineProperty(options.headers, 'Authorization', {
          value: tokenHeader,
          writable: false,
          enumerable: true
        });
      }

      return innerXhr(options, callback);
    };
  }
}
