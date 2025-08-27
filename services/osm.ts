import { BaseHttpClient, BaseHttpClientError } from "~/services/http";
import type { ICancelableClient } from '~/services/loading';
import type { TdeiClient } from '~/services/tdei';
import * as xml from '~/util/xml';

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

  async getWorkspaceBbox(id: number) {
    const response = await this._get(`workspaces/${id}/bbox.json`);

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

  async createChangeset(workspaceId: number): number {
    const doc = xml.parse('<osm><changeset></changeset></osm>');
    const changesetNode = doc.firstChild.firstChild;
    changesetNode.appendChild(xml.makeNode(doc, "tag", { k: 'workspace', v: workspaceId }));
    changesetNode.appendChild(xml.makeNode(doc, "tag", { k: 'comment', v: 'Import workspace' }));
    changesetNode.appendChild(xml.makeNode(doc, "tag", { k: 'created_by', v: 'TDEI Workspaces' }));

    const body = xml.serialize(doc);
    const response = await this._put('changeset/create', body, {
      headers: { ...this._requestHeaders, 'X-Workspace': workspaceId }
    });

    return Number(await response.text());
  }

  async uploadChangeset(workspaceId: number, changesetId: number, changesetXml: string) {
    await this._post(`changeset/${changesetId}/upload`, changesetXml, {
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': this._requestHeaders['Authorization'],
        'X-Workspace': workspaceId
      }
    });
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
