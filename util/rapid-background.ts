// Picks the background imagery when a workspace opens in Rapid 2 or 3. Both
// Rapids keep the last imagery used, even where it has no coverage (e.g. SF
// imagery when opening a Seattle workspace), so the map shows nothing. Imagery
// that covers only part of a workspace leaves the rest of it black, so imagery
// covering the whole workspace comes first.

import type { BoundingBox } from '~/types/bbox';

/** An imagery source: Rapid 2 has the fields itself, Rapid 3 in `props`. */
export interface RapidBackgroundSource {
  id: string;
  template?: string;
  best?: boolean;
  overlay?: boolean;
  props?: { best?: boolean; overlay?: boolean; feature?: unknown };
}

/** Rapid's coverage index: the imagery with a coverage area around a [lon, lat]. */
type CoverageQuery = (loc: [number, number], multi: true) => { id: string }[] | null;

/** The parts of Rapid 2's and Rapid 3's imagery systems used here. */
export interface RapidBackgroundImagery {
  _baseLayer: RapidBackgroundSource | null;
  visibleSources(): RapidBackgroundSource[];
  baseLayerSource(source: RapidBackgroundSource): unknown;
  /** Also handles Esri Wayback's dated IDs. */
  setSourceByID(id: string): void;
  /** Rapid 3's coverage index. */
  _whichPolygon?: CoverageQuery | null;
  /** Rapid 2's coverage index, and the coverage areas by lowercase source ID. */
  _imageryIndex?: { query?: CoverageQuery; features?: Map<string, unknown> } | null;
}

/** The parts of a Rapid context used here. */
export interface RapidBackgroundContext {
  systems: {
    imagery: RapidBackgroundImagery;
    /** Where Rapid 3's Background pane records a pick. */
    settings?: { set(path: string, value: unknown): void };
    /** Where Rapid 2's Background pane records a pick. */
    storage?: { setItem(key: string, value: string): unknown };
  };
  viewport: { centerLoc(): [number, number] };
  workspaceId?: number;
}

/** How long to wait for the map to reach the workspace's location */
const MAP_MOVE_TIMEOUT_MS = 2000;

/** How close the map's center must be to the URL's to count as there, in degrees */
const MAP_AT_TOLERANCE = 1e-4;

/** Corners, edge midpoints and center: enough to catch imagery covering only part of a box. */
function samplePoints(extent: BoundingBox): [number, number][] {
  const lons = [extent.min_lon, (extent.min_lon + extent.max_lon) / 2, extent.max_lon];
  const lats = [extent.min_lat, (extent.min_lat + extent.max_lat) / 2, extent.max_lat];
  return lons.flatMap(lon => lats.map((lat): [number, number] => [lon, lat]));
}

/** Whether a source covers all of `extent`. Worldwide imagery has no coverage area to check. */
function coversExtent(imagery: RapidBackgroundImagery, source: RapidBackgroundSource, extent: BoundingBox): boolean {
  const query = imagery._whichPolygon ?? imagery._imageryIndex?.query;
  if (!query) return true; // no way to tell

  const id = source.id.toLowerCase();
  const worldwide = source.props
    ? !source.props.feature
    : !imagery._imageryIndex?.features?.has(id);
  return worldwide || samplePoints(extent)
    .every(loc => (query(loc, true) ?? []).some(hit => hit.id.toLowerCase() === id));
}

/** Background imagery covering the center of the view, leaving out the current one if it doesn't. */
function backgroundsHere(imagery: RapidBackgroundImagery): RapidBackgroundSource[] {
  const current = imagery._baseLayer;

  // Rapid always lists the current imagery as visible, so ask without it.
  imagery._baseLayer = null;
  let visible: RapidBackgroundSource[];
  try {
    visible = imagery.visibleSources();
  }
  finally {
    imagery._baseLayer = current;
  }

  return visible.filter(s => !(s.overlay ?? s.props?.overlay)
    && s.id !== 'none'
    && !(s.id === 'custom' && !s.template));
}

/**
 * The background imagery we'd pick where the map is now: the current imagery if
 * it covers this place, else the imagery marked best here, else the first that
 * covers it. With an `extent`, imagery covering all of it comes first; only if
 * none does, what covers the center of the view.
 */
export function chooseBackground(imagery: RapidBackgroundImagery, extent?: BoundingBox): RapidBackgroundSource | null {
  const current = imagery._baseLayer;
  const here = backgroundsHere(imagery);
  const covering = extent ? here.filter(s => coversExtent(imagery, s, extent)) : here;
  const backgrounds = covering.length ? covering : here;

  return backgrounds.find(s => s.id === current?.id)
    ?? backgrounds.find(s => s.best ?? s.props?.best)
    ?? backgrounds[0]
    ?? null;
}

const pickKey = (workspaceId: number) => `workspace-background:${workspaceId}`;

/** The imagery the user last picked for this workspace, in this browser. */
function savedPick(workspaceId: number | undefined): string | undefined {
  if (workspaceId === undefined) return undefined;
  try {
    return window.localStorage.getItem(pickKey(workspaceId)) ?? undefined;
  }
  catch {
    return undefined;
  }
}

/**
 * Remembers imagery the user picks, per workspace. Rapid's Background pane records
 * a pick in one place, which our own choice and URL changes don't go through.
 */
function rememberPicks(context: RapidBackgroundContext) {
  const save = (id: unknown) => {
    if (context.workspaceId === undefined || typeof id !== 'string') return;
    try {
      window.localStorage.setItem(pickKey(context.workspaceId), id);
    }
    catch { /* private browsing: the pick just won't stick */ }
  };

  const { settings, storage } = context.systems;
  if (settings) {
    const set = settings.set.bind(settings);
    settings.set = (path, value) => {
      if (path === 'imagery.lastUsed') save(value);
      set(path, value);
    };
  }
  if (storage) {
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === 'background-last-used') save(value);
      return setItem(key, value);
    };
  }
}

/** Contexts already remembering picks: they're set up once, but chosen for on every open. */
const remembering = new WeakSet<object>();

/** The `background=` in the URL, if any. */
function urlBackground(): string | undefined {
  const match = window.location.hash.match(/[#&]background=([^&]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Shows imagery someone chose: from the URL, or their saved pick for this
 * workspace. It only has to cover the center of the view, not the whole
 * workspace. Returns whether it applied.
 */
function applyChosen(context: RapidBackgroundContext): boolean {
  const imagery = context.systems.imagery;
  const chosen = [urlBackground(), savedPick(context.workspaceId)].filter(Boolean) as string[];
  if (!chosen.length) return false;

  const here = backgroundsHere(imagery);
  for (const id of chosen) {
    // Rapid has already applied a custom template from the URL.
    if (id.startsWith('custom:')) return true;
    const source = here.find(s => s.id === id || id.startsWith(`${s.id}_`)); // e.g. EsriWayback_2024-01-01
    if (id === 'none' || source) {
      if (id !== imagery._baseLayer?.id) imagery.setSourceByID(id);
      return true;
    }
  }
  return false;
}

/**
 * Once the map has moved to the location in the URL, shows imagery someone
 * chose if there is any, else picks imagery covering the whole workspace. Never
 * throws: failing to choose shouldn't stop the editor opening.
 */
export async function chooseBackgroundForWorkspace(context: RapidBackgroundContext): Promise<void> {
  try {
    if (!remembering.has(context)) {
      remembering.add(context);
      rememberPicks(context);
    }

    await mapAtUrlLocation(context);
    if (applyChosen(context)) return;

    const imagery = context.systems.imagery;
    const chosen = chooseBackground(imagery, await workspaceExtent(context.workspaceId));
    if (chosen && chosen.id !== imagery._baseLayer?.id) {
      imagery.baseLayerSource(chosen);
    }
  }
  catch (error) {
    console.warn('Could not choose background imagery for this workspace', error);
  }
}

/** The workspace's extent, or undefined when it's empty or can't be fetched. */
async function workspaceExtent(workspaceId: number | undefined): Promise<BoundingBox | undefined> {
  if (workspaceId === undefined) return undefined;
  try {
    const { workspacesClient } = await import('~/services/index');
    return await workspacesClient.getWorkspaceBbox(workspaceId);
  }
  catch (error) {
    console.warn('Could not find the workspace extent to choose its background imagery', error);
    return undefined;
  }
}

/** Resolves once the map is centered on the URL's `map=zoom/lat/lon`, or after a timeout. */
function mapAtUrlLocation(context: RapidBackgroundContext): Promise<void> {
  const match = window.location.hash.match(/map=[^/&]+\/([^/&]+)\/([^/&]+)/);
  const lat = Number(match?.[1]);
  const lon = Number(match?.[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Promise.resolve();
  }

  const started = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const [centerLon, centerLat] = context.viewport.centerLoc();
      const there = Math.abs(centerLon - lon) < MAP_AT_TOLERANCE && Math.abs(centerLat - lat) < MAP_AT_TOLERANCE;
      if (there || Date.now() - started > MAP_MOVE_TIMEOUT_MS) {
        resolve();
      }
      else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}
