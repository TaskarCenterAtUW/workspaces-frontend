import type { OsmApiClient } from '~/services/osm';
import type { WorkspacesClient } from '~/services/workspaces';
import { LruIndexedDbCache } from '~/services/cache';

import { OSMCHANGE_ACTION_TYPES } from '~/types/osm';

import type { LocalCache } from '~/services/cache';
import type {
  OsmChange,
  OsmChangeset,
} from '~/types/osm';
import type { AugmentedDiff } from '~/types/adiff';
import type { WorkspaceId } from '~/types/workspaces';

export type OsmChangeCacheKey = { workspaceId: WorkspaceId; changesetId: number };
export const OsmChangeDb = LruIndexedDbCache<OsmChangeCacheKey, OsmChange>;
export type AugmentedDiffCacheKey = { workspaceId: WorkspaceId; changesetId: number };
export const AugmentedDiffDb = LruIndexedDbCache<AugmentedDiffCacheKey, AugmentedDiff>;

export class OsmChangeCache {
  readonly #cache: LocalCache<OsmChangeCacheKey, OsmChange>;

  constructor(cache: LocalCache<OsmChangeCacheKey, OsmChange>) {
    this.#cache = cache;
  }

  async get(workspaceId: WorkspaceId, changesetId: number): Promise<OsmChange | undefined> {
    const osmChange = await this.#cache.get({ workspaceId, changesetId });

    if (osmChange) {
      for (const type of OSMCHANGE_ACTION_TYPES) {
        for (const element of osmChange[type] ?? []) {
          element.timestamp = new Date(element.timestamp);
        }
      }

      return osmChange;
    }
  }

  set(workspaceId: WorkspaceId, changesetId: number, osmChange: OsmChange): Promise<void> {
    return this.#cache.set({ workspaceId, changesetId }, osmChange);
  }

  prune(): Promise<void> {
    return this.#cache.prune();
  }
}

export class AugmentedDiffCache {
  readonly #cache: LocalCache<AugmentedDiffCacheKey, AugmentedDiff>;

  constructor(cache: LocalCache<AugmentedDiffCacheKey, AugmentedDiff>) {
    this.#cache = cache;
  }

  async get(workspaceId: WorkspaceId, changesetId: number): Promise<AugmentedDiff | undefined> {
    const adiff = await this.#cache.get({ workspaceId, changesetId });

    if (adiff) {
      return adiff;
    }
  }

  set(workspaceId: WorkspaceId, changesetId: number, adiff: AugmentedDiff) {
    return this.#cache.set({ workspaceId, changesetId }, adiff);
  }

  prune(): Promise<void> {
    return this.#cache.prune();
  }
}

export class ChangesetManager {
  readonly #osmClient: OsmApiClient;
  readonly #workspacesClient: WorkspacesClient;
  readonly #oscCache: OsmChangeCache;
  readonly #adiffCache: AugmentedDiffCache;

  constructor(
    osmClient: OsmApiClient,
    workspacesClient: WorkspacesClient,
    oscCache: OsmChangeCache,
    adiffCache: AugmentedDiffCache,
  ) {
    this.#osmClient = osmClient;
    this.#workspacesClient = workspacesClient;
    this.#oscCache = oscCache;
    this.#adiffCache = adiffCache;

    this.pruneCache();
  }

  async getFullChangesets(workspaceId: WorkspaceId): Promise<OsmChangeset[]> {
    const changesets = await this.#osmClient.listChangesets(workspaceId);
    const promises = [];

    for (const changeset of changesets) {
      promises.push(
        this.getOsc(workspaceId, changeset).then(c => changeset.osmChange = c),
      );
    }

    await Promise.all(promises);

    return changesets;
  }

  async pruneCache() {
    const executeCallback: (f: () => void) => void = window.requestIdleCallback
      ?? ((f: () => void) => f());
    executeCallback(() => {
      this.#oscCache.prune();
    });
    executeCallback(() => {
      this.#adiffCache.prune();
    });
  }

  async getOsc(workspaceId: WorkspaceId, changeset: OsmChangeset): Promise<OsmChange> {
    if (changeset.open) {
      // Skip the cache--someone may add more to this changeset:
      return await this.#osmClient.getOsmChange(workspaceId, changeset.id);
    }

    let osc = await this.#oscCache.get(workspaceId, changeset.id);

    if (!osc) {
      osc = await this.#osmClient.getOsmChange(workspaceId, changeset.id);
      await this.#oscCache.set(workspaceId, changeset.id, osc);
    }

    return osc;
  }

  async getAdiff(workspaceId: WorkspaceId, changeset: OsmChangeset): Promise<AugmentedDiff> {
    if (changeset.open) {
      // Skip the cache — open changesets may still receive edits:
      return await this.#workspacesClient.getChangesetAdiff(workspaceId, changeset.id);
    }

    let adiff = await this.#adiffCache.get(workspaceId, changeset.id);

    if (!adiff) {
      adiff = await this.#workspacesClient.getChangesetAdiff(workspaceId, changeset.id);
      await this.#adiffCache.set(workspaceId, changeset.id, adiff);
    }

    return adiff;
  }
}
