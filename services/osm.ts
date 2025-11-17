import parseOsmChangeXml from '@osmcha/osmchange-parser';
import type { FeatureCollection, Point } from 'geojson';

import { BaseHttpClient, BaseHttpClientError } from "~/services/http";
import * as xml from '~/util/xml';

import type { ICancelableClient } from '~/services/loading';
import type { TdeiClient } from '~/services/tdei';
import { OSMCHANGE_ACTION_TYPES } from '~/types/osm';
import type {
  OsmChange,
  OsmChangeset,
  OsmChangesetComment,
  OsmElement,
  OsmNode,
  OsmNote,
  OsmTags,
  OsmWay,
} from '~/types/osm';
import type { WorkspaceId } from '~/types/workspaces';

function formatFeatureIdPlaceholder(attributeName: string, feature: Element) {
  const id = feature.getAttribute(attributeName);

  if (id && id[0] !== '-') {
    feature.setAttribute(attributeName, '-' + id);
  }
}

function formatFeatureIdPlaceholders(feature: Element) {
  // OSM-based APIs generally expect negative IDs for insertions:
  formatFeatureIdPlaceholder('id', feature);

  if (feature.tagName === 'node') {
    // Nodes are by far the most common features--exit early to avoid
    // an extra string comparison:
    return
  }

  if (feature.tagName === 'way') {
    for (const child of feature.children) {
      if (child.tagName === 'nd') {
        formatFeatureIdPlaceholder('ref', child);
      }
    }
  } else if (feature.tagName === 'relation') {
    for (const child of feature.children) {
      if (child.tagName === 'member') {
        formatFeatureIdPlaceholder('ref', child);
      }
    }
  }
}

function notesGeoJsonToEntities(geoJson: FeatureCollection): OsmNote[] {
  const notes = [];

  for (const feature of geoJson.features) {
    const geometry = feature.geometry as Point;
    const properties = feature.properties ?? { };

    for (const comment of properties.comments) {
      comment.date = new Date(comment.date);
    }

    notes.push({
      id: properties.id,
      status: properties.status,
      lat: geometry.coordinates[1] ?? 0,
      lon: geometry.coordinates[0] ?? 0,
      created_at: new Date(properties.date_created),
      comments: properties.comments,
    });
  }

  return notes;
}

function cleanOscForDemo(features: Element[]) {
  const nodeIds = new Set();
  const ways = [];
  const wayIds = new Set();
  const relations = [];

  for (const node of features) {
    if (node.tagName === 'node') {
      nodeIds.add(node.getAttribute('id'));
    } else if (node.tagName === 'way') {
      ways.push(node);
    } else if (node.tagName === 'relation') {
      relations.push(node);
    }
  }

  let orphanCounter = 0;

  for (const way of ways) {
    let totalNodes = 0;
    let nodesRemoved = 0;

    for (const child of [...way.children]) {
      if (child.tagName === 'nd') {
        totalNodes++;

        if (!nodeIds.has(child.getAttribute('ref'))) {
          child.remove();
          nodesRemoved++;
        }
      }
    }

    if (nodesRemoved > 0) {
      orphanCounter += nodesRemoved;

      if (totalNodes - nodesRemoved <= 1) {
        way.remove();
        continue;
      }
    }

    wayIds.add(way.getAttribute('id'));
  }

  for (const relation of relations) {
    let totalMembers = 0;
    let membersRemoved = 0;

    for (const child of [...relation.children]) {
      if (child.tagName === 'member') {
        totalMembers++;

        if (!wayIds.has(child.getAttribute('ref'))) {
          child.remove();
          membersRemoved++;
        }
      }
    }

    if (membersRemoved > 0) {
      orphanCounter += membersRemoved;

      if (totalMembers - membersRemoved === 0) {
        relation.remove();
      }
    }
  }

  if (orphanCounter > 0) {
    console.warn(`Removed ${orphanCounter} orphan references!`);
  }
}

export function osm2osc(changesetId: number, osmXml: string): string {
  const osmDoc = xml.parse(osmXml);
  const features = [];

  // Filter features and build an intermediate collection. Appending
  // nodes to another document will break this iterator:
  for (const feature of osmDoc.firstChild.children) {
    if (feature.nodeType === Node.TEXT_NODE) {
      continue;
    }

    features.push(feature);
  }

  const oscDoc = xml.parse(
    '<osmChange version="0.6"><create /><modify /><delete /></osmChange>',
    'application/xml'
  );
  const createNode = oscDoc.firstChild.firstChild;

  for (const feature of features) {
    feature.setAttribute('changeset', changesetId);
    formatFeatureIdPlaceholders(feature);

    createNode.appendChild(feature);
  }

  // TODO: we should show an error for incomplete graphs:
  cleanOscForDemo(features);

  return xml.serialize(oscDoc);
}

export class OsmApiClientError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`OSM API request failed: ${response.statusText} (${response.url})`);
    this.response = response;
  }
}

export class OsmApiClient extends BaseHttpClient implements ICancelableClient {
  #webUrl: string;
  #tdeiClient: TdeiClient;

  constructor(
    webUrl: string,
    apiUrl: string,
    tdeiClient: TdeiClient,
    signal?: AbortSignal
  ) {
    super(apiUrl, signal);

    this.#webUrl = webUrl;
    this.#tdeiClient = tdeiClient;
    this.#setAuthHeader();
    this._requestHeaders['Accept'] = 'text/plain';
    this._requestHeaders['Content-Type'] = 'text/plain';
  }

  get auth() {
    return this.#tdeiClient.auth;
  }

  clone(signal?: AbortSignal) {
    return new OsmApiClient(
      this.#webUrl,
      this._baseUrl,
      this.#tdeiClient,
      signal ?? this._abortSignal
    );
  }

  webUrl(rest: string) {
    return this.#webUrl + rest
  }

  async provisionUser() {
    const body = {
      email: this.auth.email,
      display_name: this.auth.displayName
    };

    await this._put(`user/${this.auth.subject}`, JSON.stringify(body), {
      headers: { ...this._requestHeaders, 'Content-Type': 'application/json' }
    });
  }

  async createWorkspace(workspaceId: number) {
    await this._put(`workspaces/${workspaceId}`);
  }

  async deleteWorkspace(workspaceId: number) {
    await this._delete(`workspaces/${workspaceId}`);
  }

  async getWorkspaceBbox(workspaceId: number) {
    const response = await this._get(`workspaces/${workspaceId}/bbox.json`);

    if (response.status === 204) {
      return undefined
    }

    return await response.json();
  }

  async getExportBbox(id: number) {
    const bbox = await this.getWorkspaceBbox(id);

    if (bbox === undefined) {
      return undefined
    }

    // Passing the exact bounding box to the OSM map call may lose nodes on the
    // bounds. We grow the bounding box here to ensure that we export the whole
    // workspace. A bounding box of "-180,-90,180,90" covering the entire Earth
    // would be ideal, but this crashes CGImap's "map" endpoint as it allocates
    // memory for every tile in the coordinate space.
    //
    // TODO: consider implementing a dedicated endpoint for exporting the whole
    // workspace instead of reusing the existing "map" API.
    //
    const pad = 0.0000001;

    return `${bbox.min_lon},${bbox.min_lat},${bbox.max_lon + pad},${bbox.max_lat + pad}`;
  }

  async getElement(
    workspaceId: WorkspaceId,
    type: string,
    id: number,
    version: number,
  ): Promise<OsmElement> {
    const response = await this._get(`${type}/${id}/${version}`, {
      headers: {
        ...this._requestHeaders,
        'Accept': 'application/json',
        'X-Workspace': workspaceId,
      },
    });

    const element = (await response.json()).elements[0];
    element.tags = element.tags ?? { };

    return element;
  }

  async getNodes(workspaceId: WorkspaceId, nodeIds: (number | string)[]): Promise<OsmNode[]> {
    const response = await this._get(`nodes?nodes=${nodeIds.join(',')}`, {
      headers: {
        ...this._requestHeaders,
        'Accept': 'application/json',
        'X-Workspace': workspaceId,
      },
    });

    const nodes = (await response.json()).elements;

    for (const node of nodes) {
      node.timestamp = new Date(node.timestamp);
    }

    return nodes;
  }

  async getWays(workspaceId: WorkspaceId, wayIds: (number | string)[]): Promise<OsmWay[]> {
    const response = await this._get(`ways?ways=${wayIds.join(',')}`, {
      headers: {
        ...this._requestHeaders,
        'Accept': 'application/json',
        'X-Workspace': workspaceId,
      },
    });

    const ways = (await response.json()).elements;

    for (const way of ways) {
      way.timestamp = new Date(way.timestamp);
    }

    return ways;
  }

  async getWaysForNode(workspaceId: WorkspaceId, nodeId: number): Promise<OsmElement[]> {
    const response = await this._get(`node/${nodeId}/ways`, {
      headers: {
        ...this._requestHeaders,
        'Accept': 'application/json',
        'X-Workspace': workspaceId,
      },
    });

    return (await response.json()).elements;
  }

  async listChangesets(workspaceId: WorkspaceId): Promise<OsmChangeset[]> {
    const response = await this._get(`changesets.json`, {
      headers: { ...this._requestHeaders, 'X-Workspace': workspaceId },
    });

    const changesets = (await response.json())?.changesets ?? [];

    for (const changeset of changesets) {
      changeset.created_at = new Date(changeset.created_at);
      changeset.closed_at = new Date(changeset.closed_at);
    }

    return changesets;
  }

  async getChangeset(
    workspaceId: WorkspaceId,
    changesetId: number,
    includeDiscussion: boolean = false,
  ): Promise<OsmChangeset | undefined> {
    let url = `changeset/${changesetId}.json`;

    if (includeDiscussion) {
      url += '?include_discussion=true';
    }

    const response = await this._get(url, {
      headers: {
        ...this._requestHeaders,
        'Accept': 'application/json',
        'X-Workspace': workspaceId,
      },
    });

    const changeset = (await response.json())?.changeset;

    if (!changeset) {
      return;
    }

    changeset.created_at = new Date(changeset.created_at);
    changeset.closed_at = new Date(changeset.closed_at);

    for (const comment of changeset.comments ?? []) {
      comment.date = new Date(comment.date);
    }

    return changeset;
  }

  async getOsmChange(workspaceId: WorkspaceId, changesetId: number)
    : Promise<OsmChange>
  {
    const response = await this._get(`changeset/${changesetId}/download`, {
      headers: {
        ...this._requestHeaders,
        'Accept': 'application/xml',
        'X-Workspace': workspaceId,
      },
    });

    const osmChange = parseOsmChangeXml(await response.text());

    for (const type of OSMCHANGE_ACTION_TYPES) {
      for (const element of osmChange[type] ?? []) {
        element.timestamp = new Date(element.timestamp);
      }
    }

    return osmChange;
  }

  async createChangeset(workspaceId: WorkspaceId): Promise<number> {
    const doc = xml.parse('<osm><changeset></changeset></osm>');
    const changesetNode = doc.firstChild.firstChild;
    changesetNode.appendChild(xml.makeNode(doc, "tag", { k: 'workspace', v: workspaceId }));
    changesetNode.appendChild(xml.makeNode(doc, "tag", { k: 'comment', v: 'Import workspace' }));
    changesetNode.appendChild(xml.makeNode(doc, "tag", { k: 'created_by', v: 'TDEI Workspaces' }));

    const body = xml.serialize(doc);
    const response = await this._put('changeset/create', body, {
      headers: { ...this._requestHeaders, 'X-Workspace': workspaceId },
    });

    return Number(await response.text());
  }

  async uploadChangeset(workspaceId: number, changesetId: number, changesetXml: string) {
    await this._post(`changeset/${changesetId}/upload`, changesetXml, {
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': this._requestHeaders['Authorization'],
        'X-Workspace': workspaceId,
      },
    });
  }

  async getChangesetComments(
    workspaceId: WorkspaceId,
    changesetId: number,
  ): Promise<OsmChangesetComment[]> {
    // There is no OSM API that returns comments directly. We must request the
    // comments with the changeset:
    //
    const changeset = await this.getChangeset(workspaceId, changesetId, true);

    return changeset?.comments ?? [];
  }

  async postChangesetComment(
    workspaceId: WorkspaceId,
    changesetId: number,
    message: string,
  ): Promise<void> {
    const body = new FormData();
    body.append('text', message);

    await this._post(`changeset/${changesetId}/comment`, body, {
      headers: {
        'Authorization': this._requestHeaders['Authorization'],
        'X-Workspace': workspaceId,
      },
    });
  }

  async getNotes(workspaceId: WorkspaceId, includeClosed: boolean): Promise<OsmNote[]> {
    const params = new URLSearchParams();
    // Fetch the maximum number of notes:
    params.append('limit', '10000');
    // -1: all, 0: open only, > 0: days closed:
    params.append('closed', includeClosed ? '-1' : '0');

    const response = await this._get(`notes/search.json?${params}`, {
      headers: {
        ...this._requestHeaders,
        'Accept': 'application/json',
        'X-Workspace': workspaceId,
      },
    });

    return notesGeoJsonToEntities(await response.json());
  }

  async getWorkspaceData(workspaceId: number): Promise<Array> {
    const bboxParam = await this.getExportBbox(workspaceId);
    const response = await this._get(`map.json?bbox=${bboxParam}`, {
      headers: {
        ...this._requestHeaders,
        'Accept': 'application/json',
        'X-Workspace': workspaceId
      }
    });

    return (await response.json()).elements;
  }

  async exportWorkspaceXml(workspaceId: number): Promise<Blob> {
    const bboxParam = await this.getExportBbox(workspaceId);
    const response = await this._get(`map?bbox=${bboxParam}`, {
      headers: {
        ...this._requestHeaders,
        'Accept': 'application/xml',
        'X-Workspace': workspaceId
      }
    });

    return await response.blob();
  }

  #setAuthHeader() {
    if (this.#tdeiClient.auth.complete) {
      this._requestHeaders.Authorization = 'Bearer ' + this.#tdeiClient.auth.accessToken;
    }
  }

  async _send(url: string, method: string, body?: any, config?: object): Promise<Response> {
    try {
      await this.#tdeiClient.tryRefreshAuth();
      this.#setAuthHeader();

      const requestOptions = {
        credentials: 'include'
      }

      return await super._send(url, method, body, { ...requestOptions, ...config });
    } catch (e: any) {
      if (e instanceof BaseHttpClientError) {
        throw new OsmApiClientError(e.response);
      }

      throw e;
    }
  }
}
