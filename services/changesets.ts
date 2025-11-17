import { OsmApiClient } from '~/services/osm';
import { OSMCHANGE_ACTION_TYPES } from '~/types/osm';
import { LruIndexedDbCache } from '~/services/cache';

import type { LocalCache } from '~/services/cache';
import type {
  OsmChange,
  OsmChangeset,
  OsmElement,
  OsmNode,
  OsmElementType
} from '~/types/osm';
import type {
  AdiffAction,
  AdiffElement,
  AdiffNode,
  AdiffWay,
  AdiffWayNodeRef,
  AugmentedDiff
} from '~/types/adiff';

const ADIFF_ACTION_TYPES = OSMCHANGE_ACTION_TYPES;

export type OsmChangeCacheKey = { workspaceId: number, changesetId: number };
export const OsmChangeDb = LruIndexedDbCache<OsmChangeCacheKey, OsmChange>;
export type AugmentedDiffCacheKey = { workspaceId: number, changesetId: number };
export const AugmentedDiffDb = LruIndexedDbCache<AugmentedDiffCacheKey, AugmentedDiff>;

export class OsmChangeCache {
  readonly #cache: LocalCache<OsmChangeCacheKey, OsmChange>;

  constructor(cache: LocalCache<OsmChangeCacheKey, OsmChange>) {
    this.#cache = cache;
  }

  async get(workspaceId: number, changesetId: number)
    : Promise<OsmChange | undefined>
  {
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

  set(workspaceId: number, changesetId: number, osc: OsmChange): Promise<void> {
    return this.#cache.set({ workspaceId, changesetId }, osc);
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

  async get(workspaceId: number, changesetId: number)
    : Promise<AugmentedDiff | undefined>
  {
    const adiff = await this.#cache.get({ workspaceId, changesetId });

    if (adiff) {
      return adiff
    }
  }

  set(workspaceId: number, changesetId: number, adiff: AugmentedDiff) {
    return this.#cache.set({ workspaceId, changesetId }, adiff);
  }

  prune(): Promise<void> {
    return this.#cache.prune();
  }
}

export class ChangesetManager {
  readonly #osmClient: OsmApiClient;
  readonly #oscCache: OsmChangeCache;
  readonly #adiffCache: AugmentedDiffCache;;

  constructor(
    osmClient: OsmApiClient,
    oscCache: OsmChangeCache,
    adiffCache: AugmentedDiffCache
  ) {
    this.#osmClient = osmClient;
    this.#oscCache = oscCache;
    this.#adiffCache = adiffCache;

    this.pruneCache();
  }

  async getFullChangesets(workspaceId: number): Promise<Array<OsmChangeset>> {
    const changesets = await this.#osmClient.listChangesets(workspaceId);
    const promises = [];

    for (const changeset of changesets) {
      promises.push(
        this.getOsc(workspaceId, changeset).then(c => changeset.osmChange = c)
      );
    }

    await Promise.all(promises);

    return changesets;
  }

  async pruneCache() {
    const exec: Function = window.requestIdleCallback ?? ((f: Function) => f());
    exec(() => { this.#oscCache.prune() });
    exec(() => { this.#adiffCache.prune() });
  }

  async getOsc(workspaceId: number, changeset: OsmChangeset): Promise<OsmChange> {
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

  async getAdiff(workspaceId: number, changeset: OsmChangeset): Promise<AugmentedDiff> {
    if (changeset.open) {
      // Skip the cache--someone may add more to this changeset:
      return await this.#buildAdiff(workspaceId, changeset.osmChange);
    }

    let adiff = await this.#adiffCache.get(workspaceId, changeset.id);

    if (!adiff) {
      adiff = await this.#buildAdiff(workspaceId, changeset.osmChange);
      await this.#adiffCache.set(workspaceId, changeset.id, adiff);
    }

    return adiff;
  }

  async #buildAdiff(workspaceId: number, osc: OsmChange): Promise<AugmentedDiff> {
    const builder = new ChangesetAdiffBuilder(this.#osmClient, workspaceId);

    return await builder.build(osc);
  }
}

function isNode(element: AdiffElement): element is AdiffNode {
  return element.type === 'node';
}

function isWay(element: AdiffElement): element is AdiffWay {
  return element.type === 'way';
}

function osmToAdiff(element: OsmElement): AdiffElement {
  const adiff: AdiffElement = {
    ...(element as AdiffElement),
    visible: element.visible ?? true,
    tags: { ...element.tags },
  };

  if ('nodes' in adiff && 'nodes' in element) {
    adiff.nodes = element.nodes?.map(ref => ({ ref, lat: 0, lon: 0 }))
  }

  return adiff;
}

function nodeToRef(node: OsmNode): AdiffWayNodeRef {
  return { ref: node.id, lat: node.lat, lon: node.lon };
}

function splitIdVersion(idVersion: string): [number, number] {
  const idVersionParts = idVersion.split('v');
  const id = Number(idVersionParts[0]);
  const version = Number(idVersionParts[1]);

  return [id, version];
}


type OsmElementVersionMap = Map<number, OsmElement>;
type OsmElementMap = Map<number, OsmElementVersionMap>;
type OsmTypeMap = {
  [K in OsmElementType]: {
    fromChangesetIds: Set<number>,
    versions: OsmElementMap
  }
};

class AdiffElementCache {
  readonly #typeMap: OsmTypeMap;

  constructor() {
    this.#typeMap = {
      node: { fromChangesetIds: new Set(), versions: new Map() },
      way: { fromChangesetIds: new Set(), versions: new Map() },
      relation: { fromChangesetIds: new Set(), versions: new Map() },
    };
  }

  remember(element: OsmElement, fromChangeset: boolean = false) {
    this.getVersions(element.type, element.id).set(element.version, element);

    if (fromChangeset) {
      this.#typeMap[element.type].fromChangesetIds.add(element.id);
    }
  }

  getVersions(type: OsmElementType, id: number): OsmElementVersionMap {
    let versionMap = this.#typeMap[type].versions.get(id);

    if (!versionMap) {
      versionMap = new Map();
      this.#typeMap[type].versions.set(id, versionMap);
    }

    return versionMap;
  }

  getVersion<T extends OsmElement>(
    type: T['type'],
    id: number,
    version: number
  ): T | undefined  {
    return this.#typeMap[type].versions.get(id)?.get(version) as T;
  }

  getLatestVersion<T extends OsmElement>(type: T['type'], id: number)
    : T | undefined
  {
    const versionMap = this.#typeMap[type].versions.get(id);

    if (!versionMap) {
      return undefined;
    }

    return versionMap.get(Math.max(...versionMap.keys())) as T;
  }

  isInChangeset(type: OsmElementType, id: number): boolean {
    return this.#typeMap[type].fromChangesetIds.has(id);
  }
}

class ChangesetAdiffBuilder {
  readonly #osmClient: OsmApiClient;
  readonly #workspaceId: number;
  readonly #cache: AdiffElementCache;
  readonly #actions: Array<AdiffAction>;

  constructor(osmClient: OsmApiClient, workspaceId: number) {
    this.#osmClient = osmClient;
    this.#workspaceId = workspaceId;
    this.#cache = new AdiffElementCache();
    this.#actions = new Array<AdiffAction>();
  }

  async build(osmChange: OsmChange): Promise<AugmentedDiff> {
    const actions: Array<AdiffAction> = [];
    const promises = [];

    for (const type of ADIFF_ACTION_TYPES) {
      for (const element of osmChange[type] ?? []) {
        actions.push({ type, old: undefined, new: osmToAdiff(element) });
        this.#cache.remember(element, true);
      }
    }

    for (const action of actions) {
      this.#actions.push(action);

      if (action.type !== 'create') {
        promises.push(
          this.#getPreviousElement(action.new).then(e => action.old = e)
        );
      }

      promises.push(this.#expandReferences(action));
    }

    await Promise.all(promises);

    return { actions: this.#actions };
  }

  #expandReferences(action: AdiffAction): Promise<void> {
    if (isNode(action.new)) {
      return this.#expandNodeReferences(action.new);
    }

    return this.#expandWayReferences(action.new);
  }

  async #expandNodeReferences(node: AdiffNode): Promise<void> {
    const ways = await this.#fetchWays(node);

    for (const way of ways) {
      if (this.#cache.isInChangeset('way', way.id)) {
        continue;
      }

      const old = { ...way, nodes: [ ...way.nodes ?? [] ], tags: { ...way.tags } };
      const action: AdiffAction = { type: 'modify', old, new: way };

      while (action.old && action.old.changeset > node.changeset) {
        action.old = await this.#getPreviousElement(action.old);
      }

      if (action.old === old) {
        await this.#resolveWayNodes(old, old.changeset);
      }

      this.#actions.push(action);
    }
  }

  async #expandWayReferences(way: AdiffWay): Promise<void> {
    await this.#resolveWayNodes(way, way.changeset);
  }

  async #resolveWayNodes(element: AdiffWay, changesetId: number) {
    const resolvedNodes: Array<AdiffWayNodeRef> = []
    let nodeIds: Array<string | number> = element.nodes?.map(r => r.ref) ?? [];

    while (nodeIds.length > 0) {
      const refs = await this.#fetchNodes(nodeIds);
      const timestamp = new Date(element.timestamp);
      nodeIds = [];

      for (const node of refs) {
        if (node.changeset <= changesetId) {
          resolvedNodes.push(nodeToRef(node));
        } else {
          nodeIds.push(`${node.id}v${node.version - 1}`);
        }
      }
    }

    element.nodes = resolvedNodes;
  }

  async #fetchNodes(nodeIds: Array<string | number>): Promise<Array<OsmNode>> {
    const refs: Array<OsmNode> = [];
    const pendingIds = []

    for (const nodeId of nodeIds) {
      if (Number.isFinite(nodeId)) {
        const node = this.#cache.getLatestVersion<OsmNode>('node', nodeId as number);

        if (node) {
          refs.push(node);
        } else {
          pendingIds.push(nodeId);
        }
      } else {
        const [id, version] = splitIdVersion(nodeId as string);
        const node = this.#cache.getVersion<OsmNode>('node', id, version);

        if (node) {
          refs.push(node);
        } else {
          pendingIds.push(nodeId);
        }
      }
    }

    if (pendingIds.length > 0) {
      const nodes = await this.#osmClient.getNodes(this.#workspaceId, pendingIds);

      for (const node of nodes) {
        refs.push(node);
        this.#cache.remember(node);
      }
    }

    return refs;
  }

  async #fetchWays(node: AdiffElement): Promise<Array<AdiffWay>> {
    let ways = await this.#osmClient.getWaysForNode(this.#workspaceId, node.id);
    const resolvedWays = [];

    while (ways.length > 0) {
      let pendingWayIds = [];

      for (const way of ways) {
        if (way.changeset <= node.changeset) {
          const adiffWay = osmToAdiff(way) as AdiffWay;
          await this.#resolveWayNodes(adiffWay, node.changeset);
          resolvedWays.push(adiffWay);
        } else {
          pendingWayIds.push(`${way.id}v${way.version - 1}`);
        }
      }

      if (pendingWayIds.length > 0) {
        ways = await this.#osmClient.getWays(this.#workspaceId, pendingWayIds);
      } else {
        ways.length = 0;
      }
    }

    return resolvedWays;
  }

  async #getPreviousElement(element: AdiffElement): Promise<AdiffElement> {
    const version = element.version - 1;
    let prevElement = this.#cache.getVersion(element.type, element.id, version);

    if (!prevElement) {
      prevElement = await this.#osmClient.getElement(
        this.#workspaceId,
        element.type,
        element.id,
        version);
      this.#cache.remember(prevElement);
    }

    const adiffElement = osmToAdiff(prevElement);

    if (isWay(adiffElement)) {
      await this.#resolveWayNodes(adiffElement, element.changeset - 1);
    }

    return adiffElement;
  }
}
