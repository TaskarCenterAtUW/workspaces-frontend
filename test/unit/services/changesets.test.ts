import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangesetManager } from '~/services/changesets';
import { $CHANGESET, ReviewListItem } from '~/services/review';

import type { AugmentedDiffCache, OsmChangeCache } from '~/services/changesets';
import type { OsmApiClient } from '~/services/osm';
import type { WorkspacesClient } from '~/services/workspaces';
import type { AugmentedDiff } from '~/types/adiff';
import type { OsmChangeset } from '~/types/osm';

const changeset = {
  id: 42,
  open: false,
} as OsmChangeset;

const adiff: AugmentedDiff = { actions: [] };

function makeManager(adiffCache: Pick<AugmentedDiffCache, 'get' | 'set' | 'prune'>) {
  const osmClient = {} as OsmApiClient;
  const workspacesClient = {
    getChangesetAdiff: vi.fn().mockResolvedValue(adiff),
  } as unknown as WorkspacesClient;
  const oscCache = {
    prune: vi.fn().mockResolvedValue(undefined),
  } as unknown as OsmChangeCache;

  const manager = new ChangesetManager(
    osmClient,
    workspacesClient,
    oscCache,
    adiffCache as AugmentedDiffCache,
  );

  return { manager, workspacesClient };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChangesetManager.getAdiff', () => {
  it('uses the downloaded response when the cache write fails', async () => {
    const cache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockRejectedValue(new Error('Quota exceeded')),
      prune: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { manager } = makeManager(cache);

    await expect(manager.getAdiff(1, changeset)).resolves.toBe(adiff);
  });

  it('downloads the response when the cache cannot be read', async () => {
    const cache = {
      get: vi.fn().mockRejectedValue(new Error('IndexedDB unavailable')),
      set: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { manager, workspacesClient } = makeManager(cache);

    await expect(manager.getAdiff(1, changeset)).resolves.toBe(adiff);
    expect(workspacesClient.getChangesetAdiff).toHaveBeenCalledWith(1, 42);
  });

  it('downloads a fresh response when retrying', async () => {
    const cachedAdiff: AugmentedDiff = { actions: [] };
    const cache = {
      get: vi.fn().mockResolvedValue(cachedAdiff),
      set: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    };

    const { manager, workspacesClient } = makeManager(cache);

    await expect(manager.getAdiff(1, changeset, true)).resolves.toBe(adiff);
    expect(cache.get).not.toHaveBeenCalled();
    expect(workspacesClient.getChangesetAdiff).toHaveBeenCalledWith(1, 42);
  });
});

describe('ReviewListItem.awaitOsmChange', () => {
  it('clears a failed preload so the item can be tried again', async () => {
    const item = new ReviewListItem($CHANGESET, changeset);

    await expect(item.awaitOsmChange(Promise.reject(new Error('Network error')))).rejects.toThrow(
      'Network error',
    );

    expect(item.loadingChangeset).toBe(false);
    expect(item.oscPromise).toBeUndefined();
  });
});
