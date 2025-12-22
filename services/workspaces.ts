import { BaseHttpClient, BaseHttpClientError } from "~/services/http";
import { buildPathwaysCsvArchive } from '~/services/pathways';
import { compareStringAsc } from '~/util/compare';

import type { ICancelableClient } from '~/services/loading';
import type { OsmApiClient } from '~/services/osm';
import type { TdeiAuthStore, TdeiClient } from '~/services/tdei';
import type { BoundingBox } from '~/types/bbox'
import type {
  QuestSettings,
  QuestSettingsPatch,
  User,
  Workspace,
  WorkspaceCreation,
  WorkspaceId,
  WorkspacePatch,
  WorkspaceTeam,
} from '~/types/workspaces';

export function compareWorkspaceCreatedAtDesc(a: Workspace, b: Workspace) {
  return b.createdAt.getTime() - a.createdAt.getTime();
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
  #newApiUrl: string;

  constructor(
    apiUrl: string,
    newApiUrl: string,
    tdeiClient: TdeiClient,
    osmClient: OsmApiClient,
    signal?: AbortSignal
  ) {
    super(apiUrl, signal);

    this.#tdeiClient = tdeiClient;
    this.#osmClient = osmClient;
    this.#newApiUrl = newApiUrl;
  }

  get auth(): TdeiAuthStore {
    return this.#tdeiClient.auth;
  }

  // Transitional helper for migration to a new API backend
  get #newApi() {
    return new WorkspacesClient(
      this.#newApiUrl,
      this.#newApiUrl,
      this.#tdeiClient,
      this.#osmClient,
      this._abortSignal
    );
  }

  clone(signal?: AbortSignal): WorkspacesClient {
    return new WorkspacesClient(
      this._baseUrl,
      this.#newApiUrl,
      this.#tdeiClient,
      this.#osmClient,
      signal ?? this._abortSignal
    );
  }

  async getMyWorkspaces(): Promise<Workspace[]> {
    const response = await this._get('workspaces/mine');
    const workspaces = (await response.json()) ?? [];

    for (const workspace of workspaces) {
      workspace.createdAt = new Date(workspace.createdAt);
      workspace.tdeiMetadata = JSON.parse(workspace.tdeiMetadata || '{}');
    }

    return workspaces;
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace> {
    const response = await this._get(`workspaces/${id}`);

    return await response.json();
  }

  getWorkspaceBbox(id: WorkspaceId): Promise<BoundingBox> {
    return this.#osmClient.getWorkspaceBbox(id);
  }

  async createWorkspace(workspace: WorkspaceCreation): Promise<WorkspaceId> {
    workspace.createdBy = this.#tdeiClient.auth.subject;
    workspace.createdByName = this.#tdeiClient.auth.displayName;

    const workspaceResponse = await this._post('workspaces', workspace);
    const workspaceId = (await workspaceResponse.json()).workspaceId;
    await this.#osmClient.createWorkspace(workspaceId);

    return workspaceId;
  }

  async updateWorkspace(id: WorkspaceId, workspaceDetails: WorkspacePatch)
    : Promise<void>
  {
    await this._patch(`workspaces/${id}`, workspaceDetails);
  }

  async exportWorkspaceArchive(workspace: Workspace): Promise<Blob> {
    if (workspace.type === 'pathways') {
      const elements = await this.#osmClient.getWorkspaceData(workspace.id);
      return await buildPathwaysCsvArchive(elements);
    }

    const osmXml = await this.#osmClient.exportWorkspaceXml(workspace.id);

    return await this.#tdeiClient.convertDataset(
      osmXml,
      'osm',
      'osw',
      workspace.tdeiProjectGroupId
    );
  }

  async deleteWorkspace(id: WorkspaceId): Promise<void> {
    await Promise.all([
      this._delete(`workspaces/${id}`),
      this.#osmClient.deleteWorkspace(id)
    ]);
  }

  async getLongFormQuestSettings(id: WorkspaceId): Promise<QuestSettings> {
    const response = await this._get(`workspaces/${id}/quests/long/settings`);

    return await response.json();
  }

  async saveLongFormQuestSettings(id: WorkspaceId, settings: QuestSettingsPatch)
    : Promise<void>
  {
    await this._patch(`workspaces/${id}/quests/long/settings`, settings);
  }

  async saveImageryDefSettings(workspaceId: number, settings: object): Promise<void> {
    await this._patch(`workspaces/${workspaceId}/imagery/settings`, settings);
  }

  async getTeams(id: WorkspaceId): Promise<WorkspaceTeam[]> {
    const response = await this.#newApi._get(`workspaces/${id}/teams`);

    return (await response.json())
      .sort(compareStringAsc<WorkspaceTeam>(t => t.name));
  }

  async getTeam(id: WorkspaceId, teamId: number): Promise<WorkspaceTeam> {
    const response = await this.#newApi._get(`workspaces/${id}/teams/${teamId}`);

    return await response.json();
  }

  async createTeam(id: WorkspaceId, name: string): Promise<number> {
    const response = await this.#newApi._post(`workspaces/${id}/teams`, {
      name,
    });

    return Number(await response.text());
  }

  async updateTeam(id: WorkspaceId, teamId: number, name: string): Promise<void> {
    await this.#newApi._put(`workspaces/${id}/teams/${teamId}`, { name });
  }

  async deleteTeam(id: WorkspaceId, teamId: number): Promise<void> {
    await this.#newApi._delete(`workspaces/${id}/teams/${teamId}`);
  }

  async getTeamMembers(id: WorkspaceId, teamId: number): Promise<User[]> {
    const response = await this.#newApi._get(`workspaces/${id}/teams/${teamId}/members`);

    return (await response.json())
      .sort(compareStringAsc<User>(u => u.display_name));
  }

  async joinTeam(id: WorkspaceId, teamId: number): Promise<User> {
    const response = await this.#newApi._post(`workspaces/${id}/teams/${teamId}/members`);

    return await response.json();
  }

  async addToTeam(id: WorkspaceId, teamId: number, userId: number): Promise<void> {
    await this.#newApi._put(`workspaces/${id}/teams/${teamId}/members/${userId}`);
  }

  async removeFromTeam(id: WorkspaceId, teamId: number, userId: number): Promise<void> {
    await this.#newApi._delete(`workspaces/${id}/teams/${teamId}/members/${userId}`);
  }

  #setAuthHeader() {
    if (this.#tdeiClient.auth.complete) {
      this._requestHeaders.Authorization = 'Bearer ' + this.auth.accessToken;
    }
  }

  override async _send(
    url: string,
    method: string,
    body?: any,
    config?: object
  ): Promise<Response> {
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
