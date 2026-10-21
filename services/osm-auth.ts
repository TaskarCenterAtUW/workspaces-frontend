/**
 * TDEI-backed sign-in for Rapid's OSM service.
 *
 * Rapid's OSM service treats a 400, 401 or 403 from the API as bad OSM
 * credentials: it logs out and retries the request, expecting the retry to go
 * out signed out. Workspaces signs Rapid in with TDEI instead, so logging out
 * of OSM changes nothing: Rapid still sees a signed-in user, gets the same
 * error, and logs out and retries again, forever (e.g. a map data tile the
 * user may not read, re-requested in a tight loop).
 *
 * Here, Rapid's logout refreshes the TDEI access token instead, and while the
 * refresh runs the user counts as signed out, so Rapid's immediate retry
 * reports its error rather than looping. Later requests use the refreshed
 * token. Concurrent logouts share one refresh.
 */
export interface OsmAuth {
  /** Replaces the OSM service's `_oauth.authenticated`. */
  authenticated: () => boolean;
  /** Replaces the OSM service's `logout`. */
  logout: () => void;
}

/**
 * @param isSignedIn - whether the TDEI session is usable (e.g. `tdeiAuth.ok`)
 * @param refresh - refreshes the TDEI access token (e.g. `tdeiClient.refreshToken()`)
 */
export function tdeiOsmAuth(isSignedIn: () => boolean, refresh: () => Promise<void>): OsmAuth {
  let refreshing = false;
  return {
    authenticated: () => isSignedIn() && !refreshing,
    logout: () => {
      if (refreshing) return;
      refreshing = true;
      refresh()
        .catch(error => console.warn('Refreshing the TDEI session after an OSM API auth error failed', error))
        .finally(() => {
          refreshing = false;
        });
    }
  };
}
