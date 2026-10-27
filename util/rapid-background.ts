// Picks the background imagery when a workspace opens in Rapid 2 or 3. Both
// Rapids keep the last imagery used, even where it has no coverage (e.g. SF
// imagery when opening a Seattle workspace), so the map shows nothing.

/** An imagery source: Rapid 2 has the fields itself, Rapid 3 in `props`. */
export interface RapidBackgroundSource {
  id: string;
  template?: string;
  best?: boolean;
  overlay?: boolean;
  props?: { best?: boolean; overlay?: boolean };
}

/** The parts of Rapid 2's and Rapid 3's imagery systems used here. */
export interface RapidBackgroundImagery {
  _baseLayer: RapidBackgroundSource | null;
  visibleSources(): RapidBackgroundSource[];
  baseLayerSource(source: RapidBackgroundSource): unknown;
}

/** The parts of a Rapid context used here. */
export interface RapidBackgroundContext {
  systems: { imagery: RapidBackgroundImagery };
  viewport: { centerLoc(): [number, number] };
}

/** How long to wait for the map to reach the workspace's location */
const MAP_MOVE_TIMEOUT_MS = 2000;

/** How close the map's center must be to the URL's to count as there, in degrees */
const MAP_AT_TOLERANCE = 1e-4;

/**
 * The background imagery to show where the map is now: the imagery marked
 * best here, else the current imagery if it covers this place, else the first
 * that does, as Rapid itself chooses.
 */
export function chooseBackground(imagery: RapidBackgroundImagery): RapidBackgroundSource | null {
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

  const backgrounds = visible.filter(s => !(s.overlay ?? s.props?.overlay)
    && s.id !== 'none'
    && !(s.id === 'custom' && !s.template));

  return backgrounds.find(s => s.best ?? s.props?.best)
    ?? backgrounds.find(s => s.id === current?.id)
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
    const chosen = chooseBackground(imagery);
    if (chosen && chosen.id !== imagery._baseLayer?.id) {
      imagery.baseLayerSource(chosen);
    }
  }
  catch (error) {
    console.warn('Could not choose background imagery for this workspace', error);
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
