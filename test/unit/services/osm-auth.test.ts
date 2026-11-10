import { describe, expect, it, vi } from 'vitest';
import { tdeiOsmAuth } from '~/services/osm-auth';

describe('tdeiOsmAuth', () => {
  it('signs in with TDEI', () => {
    let ok = true;
    const auth = tdeiOsmAuth(() => ok, vi.fn().mockResolvedValue(undefined));
    expect(auth.authenticated()).toBe(true);
    ok = false;
    expect(auth.authenticated()).toBe(false);
  });

  it('refreshes the TDEI token on logout, counting as signed out until it finishes', async () => {
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    const auth = tdeiOsmAuth(() => true, refresh);

    auth.logout();
    // Rapid retries right after logging out; that retry must go out signed out, so it reports its error.
    expect(auth.authenticated()).toBe(false);
    auth.logout(); // e.g. other tiles failing at the same time
    expect(refresh).toHaveBeenCalledTimes(1);

    finish();
    await vi.waitFor(() => expect(auth.authenticated()).toBe(true));
  });

  it('signs back in even when the refresh fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const auth = tdeiOsmAuth(() => true, vi.fn().mockRejectedValue(new Error('offline')));

    auth.logout();
    expect(auth.authenticated()).toBe(false);
    await vi.waitFor(() => expect(auth.authenticated()).toBe(true));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stops Rapid\'s logout-and-retry from looping on an auth error', async () => {
    // Rapid's OsmService.loadFromAPI: on 400/401/403 while authenticated, log out and retry.
    const auth = tdeiOsmAuth(() => true, () => new Promise<void>(resolve => setTimeout(resolve, 10)));
    let requests = 0;
    const loadFromAPI = (callback: (status: number) => void) => {
      requests++;
      const status = 403;
      if (auth.authenticated() && status === 403) {
        auth.logout();
        loadFromAPI(callback);
        return;
      }
      callback(status);
    };

    const result = await new Promise(resolve => loadFromAPI(resolve));
    expect(result).toBe(403);
    expect(requests).toBe(2); // the request and one retry
  });
});
