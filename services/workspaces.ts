import { BaseHttpClient, BaseHttpClientError } from "~/services/http";
import type { ICancelableClient } from '~/services/loading';
import type { OsmApiClient } from '~/services/osm';
import { buildPathwaysCsvArchive } from '~/services/pathways';
import type { TdeiClient } from '~/services/tdei';

export function compareWorkspaceCreatedAtDesc(a, b) {
  return b.createdAt - a.createdAt;
}

export class WorkspacesClientError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`Workspaces request failed: ${response.statusText} (${response.url})`);
    this.response = response;
  }
}

export class WorkspacesClient extends BaseHttpClient implements ICancelableClient {
  #tdeiClient: TdeiClient;
  #osmClient: OsmApiClient;

  constructor(
    apiUrl: string,
    tdeiClient: TdeiClient,
    osmClient: OsmApiClient,
    signal?: AbortSignal
  ) {
    super(apiUrl, signal);

    this.#tdeiClient = tdeiClient;
    this.#osmClient = osmClient;
  }

  get auth() {
    return this.#tdeiClient.auth;
  }

  clone(signal?: AbortSignal) {
    return new WorkspacesClient(
      this._baseUrl,
      this.#tdeiClient,
      this.#osmClient,
      signal ?? this._abortSignal
    );
  }

  async getMyWorkspaces() {
    const response = await this._get('workspaces/mine');
    const workspaces = (await response.json()) ?? [];

    for (const workspace of workspaces) {
      workspace.createdAt = new Date(workspace.createdAt);
      workspace.tdeiMetadata = JSON.parse(workspace.tdeiMetadata || '{}');
    }

    return workspaces;
  }

  async getWorkspace(id: number) {
    try {
      const response = await this._get(`workspaces/${id}`);
      return await response.json();
    } catch (e: any) {
      return null;
    }
  }

  getWorkspaceBbox(id: number) {
    return this.#osmClient.getWorkspaceBbox(id);
  }

  async createWorkspace(workspace): Promise<number> {
    workspace.createdBy = this.#tdeiClient.auth.subject;
    workspace.createdByName = this.#tdeiClient.auth.displayName;

    const workspaceResponse = await this._post('workspaces', workspace);
    const workspaceId = (await workspaceResponse.json()).workspaceId;
    await this.#osmClient.createWorkspace(workspaceId);

    return workspaceId;
  }

  async updateWorkspace(id: number, workspaceDetails: object): Promise {
    await this._patch(`workspaces/${id}`, workspaceDetails);
  }

  async exportWorkspaceArchive(workspace): Promise<Blob> {
    if (workspace.type === 'pathways') {
      const elements = await this.#osmClient.getWorkspaceData(workspace.id);
      return await buildPathwaysCsvArchive(elements);
    }

    const osm = await this.#osmClient.exportWorkspaceXml(workspace.id);

    return await this.#tdeiClient.convertDataset(osm, 'osm', 'osw', workspace.tdeiProjectGroupId);
  }

  async deleteWorkspace(id: number): Promise {
    await Promise.all([
      this._delete(`workspaces/${id}`),
      this.#osmClient.deleteWorkspace(id)
    ]);
  }

  async getLongFormQuestSettings(workspaceId: number) {
    const response = this._get(`workspaces/${workspaceId}/quests/long/settings`);
    return response.then(data => {
      // case when no existing settings exist, just show empty form
      if(data.status === 204) return {};   
      return data.json();
    });
  }

  async saveLongFormQuestSettings(workspaceId: number, settings: object): Promise<void> {
      this._patch(`workspaces/${workspaceId}/quests/long/settings`, settings);
  }

  async saveImageryDefSettings(workspaceId: number, settings: object): Promise<void> {
      this._patch(`workspaces/${workspaceId}/imagery/settings`, settings);
  }

  #setAuthHeader() {
    if (this.#tdeiClient.auth.complete) {
      this._requestHeaders.Authorization = 'Bearer ' + this.#tdeiClient.auth.accessToken;
    }
  }

  override async _send(url: string, method: string, body?: any, config?: object): Promise<Response> {
    try {
      await this.#tdeiClient.tryRefreshAuth();
      this.#setAuthHeader();

      return await super._send(url, method, body, config);
    } catch (e) {
      if (e instanceof BaseHttpClientError) {
        throw new WorkspacesClientError(e.response);
      }

      throw e;
    }
  }
}
