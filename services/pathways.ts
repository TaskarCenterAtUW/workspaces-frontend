import {
  BlobReader,
  BlobWriter,
  TextWriter,
  ZipReader
} from '@zip.js/zip.js';

import { parseCsv } from '~/util/csv';
import { pathwayIdGenerator, stopIdGenerator } from '~/services/gtfs-ids';
import { isLevelArea, isPathway, stopNodes } from '~/services/pathways-levels';
import { createEmptyGtfsDataset, createGtfsArchive } from '~/util/gtfs';
import * as xml from '~/util/xml';
import type { TdeiAuthStore, TdeiClient } from '~/services/tdei';

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
 * one (drawn in the editor), or whose tag duplicates an older element's (e.g.
 * copy-pasted), get the ID `generate` makes for them (unique among `used`),
 * or else `prefix` + their OSM ID. The oldest element (lowest OSM ID, so the
 * imported one rather than a later copy) keeps a duplicated ID. Generated IDs
 * also avoid `reserved` (e.g. an agency feed's IDs), which tagged IDs may match.
 */
function assignGtfsIds(
  elements: any[],
  idTag: string,
  prefix: string,
  generate?: (element: any, used: Set<string>) => string | undefined,
  reserved: Set<string> = new Set()
): Map<number, string> {
  const ids = new Map<number, string>();
  const used = new Set<string>();
  const needsId: any[] = [];

  // Tagged IDs first, so a generated ID can never take one an element already has.
  const oldestFirst = [...elements].sort((a, b) => Number(a.id) - Number(b.id));
  for (const element of oldestFirst) {
    const tagged = String(element.tags?.[idTag] ?? '').trim();
    if (tagged && !used.has(tagged)) {
      ids.set(element.id, tagged);
      used.add(tagged);
    } else {
      needsId.push(element);
    }
  }

  for (const id of reserved) used.add(id);

  for (const element of needsId) {
    let generated = generate?.(element, used) ?? `${prefix}${element.id}`;
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
    // An outline without a level_name keeps the original's.
    const originalName = String(rows.get(levelId)?.level_name ?? '').trim();
    const name = String(area.tags.level_name ?? '').trim() || originalName;
    rows.set(levelId, { ...area.tags, level_id: levelId, level_name: name });
  }

  return rows.size ? toCsv(LEVELS_COLUMNS, [...rows.values()]) : undefined;
}

/**
 * The TDEI dataset a pathways workspace was made from, if it still exists:
 * its ID, and all of its GTFS files as text (not just stops, pathways and
 * levels, so an export keeps agency.txt, routes.txt, stop_times.txt, ...).
 * Both exports (Download and Export to TDEI) build on it, so they match.
 */
export async function fetchDerivedPathwaysDataset(
  tdeiClient: TdeiClient,
  tdeiRecordId: string | undefined
): Promise<{ datasetId?: string; files?: Map<string, string> }> {
  if (!tdeiRecordId || typeof await tdeiClient.getDatasetInfo(tdeiRecordId) !== 'object') {
    return {};
  }

  const zip = await tdeiClient.downloadPathwaysDataset(tdeiRecordId);
  const { dataset } = await tdeiClient.openDatasetArchive(zip);
  const files = dataset ? await openTdeiPathwaysArchive(dataset, false, false) as Map<string, string> : undefined;
  return { datasetId: tdeiRecordId, files };
}

/** Files a GTFS feed needs, besides its calendar, to pass TDEI's validation (MobilityData's validator). */
const REQUIRED_FEED_FILES = ['agency.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt'];

/** GTFS files that aren't .txt: GTFS-Flex's locations, which stop_times.txt may refer to. */
const OTHER_FEED_FILES = new Set(['locations.geojson']);

/**
 * An agency's GTFS feed, read from its zip: each GTFS file's text (the .txt
 * files and locations.geojson), by file name. A feed zipped inside a folder
 * (e.g. "google_transit/stops.txt") reads the same.
 */
export async function openAgencyFeed(zip: Blob): Promise<Map<string, string>> {
  const files = await openTdeiPathwaysArchive(zip, false, false) as Map<string, string>;
  const feed = new Map<string, string>();
  for (const [path, content] of files) {
    const name = path.split('/').at(-1)!;
    const isGtfsFile = name.toLowerCase().endsWith('.txt') || OTHER_FEED_FILES.has(name);
    if (isGtfsFile && !feed.has(name)) feed.set(name, content);
  }
  return feed;
}

/** The files a feed lacks to pass TDEI's validation, e.g. ["trips.txt", "calendar.txt or calendar_dates.txt"]. */
export function missingFeedFiles(feed: Map<string, string>): string[] {
  const missing = REQUIRED_FEED_FILES.filter(name => !feed.has(name));
  if (!feed.has('calendar.txt') && !feed.has('calendar_dates.txt')) {
    missing.push('calendar.txt or calendar_dates.txt');
  }
  return missing;
}

type CsvRow = Record<string, unknown>;

const text = (value: unknown) => String(value ?? '').trim();

/**
 * Merges a workspace's stops and pathways into an agency's feed, for a
 * workspace that wasn't made from that feed (so the feed's other files, e.g.
 * stop_times.txt, still find the stops they use):
 * - The workspace's stops replace the agency's with the same stop_id. In the
 *   stations the workspace covers, its entrances, generic nodes and boarding
 *   areas replace all of the agency's. Every other agency stop is kept, e.g.
 *   other stations', and platforms trips stop at.
 * - The agency's pathways that touch a replaced stop, or share a pathway_id
 *   with the workspace's, are dropped; the rest are kept.
 */
export function mergeIntoAgencyFeed(
  agencyStops: CsvRow[],
  agencyPathways: CsvRow[],
  stopRows: CsvRow[],
  pathwayRows: CsvRow[]
): { stops: CsvRow[]; pathways: CsvRow[] } {
  const agencyById = new Map(agencyStops.map(stop => [text(stop.stop_id), stop]));
  const workspaceStopIds = new Set(stopRows.map(stop => text(stop.stop_id)));

  // A stop's station: its parent_station, or for a boarding area, its platform's.
  const stationOf = (stop: CsvRow, byId: Map<string, CsvRow>) => {
    const parent = text(stop.parent_station);
    return text(stop.location_type) === '4' ? text(byId.get(parent)?.parent_station) || parent : parent;
  };
  const workspaceById = new Map(stopRows.map(stop => [text(stop.stop_id), stop]));
  const lookup = new Map([...agencyById, ...workspaceById]);
  const coveredStations = new Set(stopRows.flatMap(stop =>
    text(stop.location_type) === '1' ? [text(stop.stop_id)] : [stationOf(stop, lookup)]).filter(Boolean));

  const replaced = new Set<string>(workspaceStopIds);
  const keptStops = agencyStops.filter((stop) => {
    const id = text(stop.stop_id);
    const inCoveredStation = ['2', '3', '4'].includes(text(stop.location_type)) && coveredStations.has(stationOf(stop, agencyById));
    if (workspaceStopIds.has(id) || inCoveredStation) {
      replaced.add(id);
      return false;
    }
    return true;
  });

  const workspacePathwayIds = new Set(pathwayRows.map(pathway => text(pathway.pathway_id)));
  const keptPathways = agencyPathways.filter(pathway => !workspacePathwayIds.has(text(pathway.pathway_id))
    && !replaced.has(text(pathway.from_stop_id)) && !replaced.has(text(pathway.to_stop_id)));

  return { stops: [...keptStops, ...stopRows], pathways: [...keptPathways, ...pathwayRows] };
}

/**
 * The workspace as a GTFS Pathways archive, built on `gtfsFiles`: the dataset
 * it was made from (its stops and pathways replaced by the workspace's), or,
 * with `mergeWithFeed`, an agency feed it wasn't made from (see
 * `mergeIntoAgencyFeed`). Without either, placeholder files fill in the rest of
 * the feed (fine for a Download, not for TDEI).
 */
export async function buildPathwaysCsvArchive(
  elements: any[],
  gtfsFiles?: Map<string, string>,
  { mergeWithFeed = false }: { mergeWithFeed?: boolean } = {}
): Promise<Blob> {
  if (!gtfsFiles) {
    gtfsFiles = createEmptyGtfsDataset();
  }

  // A GTFS pathway runs between two stops and has no geometry of its own, so only
  // a way's first and last nodes are its endpoints. Untagged nodes that only
  // shape a line or a level box aren't stops. Level boxes aren't pathways.
  const ways = elements.filter(isPathway);
  const stops = stopNodes(elements);

  // An agency feed's own stops and pathways, which the workspace's are merged into.
  const feedRows = async (name: string) => (mergeWithFeed && gtfsFiles!.get(name)?.trim()
    ? await parseCsv(gtfsFiles!.get(name)!) as CsvRow[]
    : []);
  const agencyStops = await feedRows('stops.txt');
  const agencyPathways = await feedRows('pathways.txt');

  // Stops and pathways in a station follow the workspace's ID pattern (see
  // gtfs-ids.ts); ones outside any station get ws-n<id> / ws-w<id>. Generated
  // IDs avoid the agency's, so a new feature can't replace an agency stop by
  // accident (a tagged ID still replaces its stop on purpose).
  const stopIds = assignGtfsIds(stops, 'stop_id', GENERATED_STOP_ID_PREFIX, stopIdGenerator(elements),
    new Set(agencyStops.map(stop => text(stop.stop_id))));
  const pathwayIds = assignGtfsIds(ways, 'pathway_id', GENERATED_PATHWAY_ID_PREFIX, pathwayIdGenerator(elements),
    new Set(agencyPathways.map(pathway => text(pathway.pathway_id))));

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

  let stopsOut: CsvRow[] = stopRows;
  let pathwaysOut: CsvRow[] = pathwayRows;
  if (mergeWithFeed) {
    ({ stops: stopsOut, pathways: pathwaysOut } = mergeIntoAgencyFeed(agencyStops, agencyPathways, stopRows, pathwayRows));
  }

  const stopsCsv = toCsv(STOPS_COLUMNS, stopsOut);
  const pathwaysCsv = toCsv(PATHWAYS_COLUMNS, pathwaysOut);

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
