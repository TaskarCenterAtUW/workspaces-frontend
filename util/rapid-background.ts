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
  /** Rapid 3's coverage index. */
  _whichPolygon?: CoverageQuery | null;
  /** Rapid 2's coverage index, and the coverage areas by lowercase source ID. */
  _imageryIndex?: { query?: CoverageQuery; features?: Map<string, unknown> } | null;
}

/** The parts of a Rapid context used here. */
export interface RapidBackgroundContext {
  systems: { imagery: RapidBackgroundImagery };
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

/**
 * The background imagery to show where the map is now: the current imagery if
 * it covers this place, else the imagery marked best here, else the first that
 * covers it. With an `extent`, imagery covering all of it comes first.
 */
export function chooseBackground(imagery: RapidBackgroundImagery, extent?: BoundingBox): RapidBackgroundSource | null {
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

  const here = visible.filter(s => !(s.overlay ?? s.props?.overlay)
    && s.id !== 'none'
    && !(s.id === 'custom' && !s.template));
  const covering = extent ? here.filter(s => coversExtent(imagery, s, extent)) : here;
  const backgrounds = covering.length ? covering : here;

  return backgrounds.find(s => s.id === current?.id)
    ?? backgrounds.find(s => s.best ?? s.props?.best)
    ?? backgrounds[0]
    ?? null;
}

/**
 * Once the map has moved to the location in the URL, switches the background
 * imagery if what's shown doesn't cover it. Never throws: failing to choose
 * shouldn't stop the editor opening.
 */
export async function chooseBackgroundForWorkspace(context: RapidBackgroundContext): Promise<void> {
  try {
    await mapAtUrlLocation(context);

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
