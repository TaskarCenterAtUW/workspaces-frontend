import {
  BlobReader,
  BlobWriter,
  TextWriter,
  ZipReader
} from '@zip.js/zip.js';

import { parseCsv } from '~/util/csv';
import { isLevelArea, isPathway, stopNodes } from '~/services/pathways-levels';
import { createEmptyGtfsDataset, createGtfsArchive } from '~/util/gtfs';
import * as xml from '~/util/xml';
import type { TdeiAuthStore } from '~/services/tdei';

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

// The stops.txt and pathways.txt columns from the GTFS reference, in spec order.
// Each is filled from the element's tag of the same name (IDs, coordinates and
// pathway endpoints are derived from the element instead).
const STOPS_COLUMNS = [
  'stop_id', 'stop_code', 'stop_name', 'tts_stop_name', 'stop_desc', 'stop_lat',
  'stop_lon', 'zone_id', 'stop_url', 'location_type', 'parent_station',
  'stop_timezone', 'wheelchair_boarding', 'level_id', 'platform_code', 'stop_access'
];
const LEVELS_COLUMNS = ['level_id', 'level_index', 'level_name'];
const PATHWAYS_COLUMNS = [
  'pathway_id', 'from_stop_id', 'to_stop_id', 'pathway_mode', 'is_bidirectional',
  'length', 'traversal_time', 'stair_count', 'max_slope', 'min_width',
  'signposted_as', 'reversed_signposted_as'
];

/** Formats one CSV field, quoting it if it contains a comma, quote or line break (RFC 4180). */
function csvField(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a CSV file with the given columns, taking each row's value for each column. */
function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map(column => csvField(row[column])).join(','));
  }
  return lines.join('\n') + '\n';
}

// Prefixes for GTFS IDs generated from OSM element IDs, so they can't collide
// with an agency's own (often numeric) IDs and are recognizable in the feed.
export const GENERATED_STOP_ID_PREFIX = 'ws-n';
export const GENERATED_PATHWAY_ID_PREFIX = 'ws-w';
export const GENERATED_LEVEL_ID_PREFIX = 'ws-l';

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

/**
 * Builds levels.txt from the level areas drawn in the workspace, on top of the
 * dataset's original levels.txt (if any). Original levels are kept, since stops
 * may still reference them, unless a drawn level has the same level_id. Returns
 * undefined when there are no levels at all.
 */
async function buildLevelsCsv(levelAreas: any[], originalCsv?: string): Promise<string | undefined> {
  const rows = new Map<string, Record<string, unknown>>();

  if (originalCsv?.trim()) {
    for (const row of await parseCsv(originalCsv) as Record<string, string>[]) {
      const levelId = row.level_id?.trim();
      if (levelId) rows.set(levelId, row);
    }
  }

  // Areas sharing a level_id are the same level; the first one's tags win.
  const levelIds = new Map<string, any>();
  for (const area of levelAreas) {
    const levelId = String(area.tags.level_id ?? '').trim();
    if (levelId && !levelIds.has(levelId)) levelIds.set(levelId, area);
  }
  const untagged = levelAreas.filter(area => !String(area.tags.level_id ?? '').trim());
  const generatedIds = assignGtfsIds(untagged, 'level_id', GENERATED_LEVEL_ID_PREFIX);

  const drawn: [string, any][] = [
    ...levelIds.entries(),
    ...untagged.map(area => [generatedIds.get(area.id)!, area] as [string, any])
  ];
  for (const [levelId, area] of drawn) {
    rows.set(levelId, { ...area.tags, level_id: levelId });
  }

  return rows.size ? toCsv(LEVELS_COLUMNS, [...rows.values()]) : undefined;
}

export async function buildPathwaysCsvArchive(elements: any[], gtfsFiles?: Map<string, string>): Promise<Blob> {
  if (!gtfsFiles) {
    gtfsFiles = createEmptyGtfsDataset();
  }

  // A GTFS pathway runs between two stops and has no geometry of its own, so only
  // a way's first and last nodes are its endpoints. Untagged nodes that only
  // shape a line or a level box aren't stops. Level boxes aren't pathways.
  const ways = elements.filter(isPathway);
  const stops = stopNodes(elements);

  const stopIds = assignGtfsIds(stops, 'stop_id', GENERATED_STOP_ID_PREFIX);
  const pathwayIds = assignGtfsIds(ways, 'pathway_id', GENERATED_PATHWAY_ID_PREFIX);

  const stopRows = stops.map(element => ({
    ...element.tags,
    stop_id: stopIds.get(element.id)!,
    stop_lat: element.lat,
    stop_lon: element.lon
  }));
  const pathwayRows = ways.map(element => ({
    ...element.tags,
    pathway_id: pathwayIds.get(element.id)!,
    from_stop_id: stopIds.get(element.nodes[0]) ?? '',
    to_stop_id: stopIds.get(element.nodes.at(-1)) ?? ''
  }));

  const stopsCsv = toCsv(STOPS_COLUMNS, stopRows);
  const pathwaysCsv = toCsv(PATHWAYS_COLUMNS, pathwayRows);

  gtfsFiles.set('pathways.txt', pathwaysCsv);
  gtfsFiles.set('stops.txt', stopsCsv);

  const levelsCsv = await buildLevelsCsv(elements.filter(isLevelArea), gtfsFiles.get('levels.txt'));
  if (levelsCsv) {
    gtfsFiles.set('levels.txt', levelsCsv);
  }

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
