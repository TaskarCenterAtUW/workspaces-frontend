import { BaseHttpClient, BaseHttpClientError } from '~/services/http';
import { getMockWorkspaceProjectsResponse } from '~/services/mock-workspace-projects';

import type { ICancelableClient } from '~/services/loading';
import type { TdeiAuthStore, TdeiClient } from '~/services/tdei';
import type {
  WorkspaceProject,
  WorkspaceProjectApiItem,
  WorkspaceProjectsApiResponse,
  WorkspaceProjectsQuery,
  WorkspaceProjectsResult,
  WorkspaceProjectSort,
} from '~/types/projects';
import type { WorkspaceId } from '~/types/workspaces';

const PAGE_SIZE_DEFAULT = 10;
const USE_MOCK_WORKSPACE_PROJECTS = import.meta.env.VITE_USE_MOCK_WORKSPACE_PROJECTS !== 'false';

function normalizeStatus(status: WorkspaceProjectApiItem['status']): WorkspaceProject['status'] {
  switch (status) {
    case 'open':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'draft':
    default:
      return 'draft';
  }
}

function normalizeProject(
  workspaceId: WorkspaceId,
  project: WorkspaceProjectApiItem,
): WorkspaceProject {
  return {
    id: project.id,
    workspaceId,
    name: project.name,
    summary: undefined,
    status: normalizeStatus(project.status),
    taskCount: project.taskCount,
    percentCompleted: project.percentCompleted,
    createdBy: project.createdBy,
    createdByName: project.createdByName,
    createdAt: new Date(project.createdAt),
    updatedAt: new Date(project.updatedAt),
  };
}

function normalizeProjectsResponse(
  workspaceId: WorkspaceId,
  response: WorkspaceProjectsApiResponse,
): WorkspaceProjectsResult {
  return {
    results: response.results.map(project => normalizeProject(workspaceId, project)),
    pagination: response.pagination,
  };
}

export class WorkspaceProjectsClientError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`Projects request failed: ${response.statusText} (${response.url})`);
    this.response = response;
  }
}

export class WorkspaceProjectsClient extends BaseHttpClient implements ICancelableClient {
  #tdeiClient: TdeiClient;
  #newApiUrl: string;

  constructor(apiUrl: string, newApiUrl: string, tdeiClient: TdeiClient, signal?: AbortSignal) {
    super(apiUrl, signal);
    this.#tdeiClient = tdeiClient;
    this.#newApiUrl = newApiUrl;
  }

  get auth(): TdeiAuthStore {
    return this.#tdeiClient.auth;
  }

  get #newApi() {
    return new WorkspaceProjectsClient(
      this.#newApiUrl,
      this.#newApiUrl,
      this.#tdeiClient,
      this._abortSignal,
    );
  }

  clone(signal?: AbortSignal): WorkspaceProjectsClient {
    return new WorkspaceProjectsClient(
      this._baseUrl,
      this.#newApiUrl,
      this.#tdeiClient,
      signal ?? this._abortSignal,
    );
  }

  getPageSize(): number {
    return PAGE_SIZE_DEFAULT;
  }

  getSortQuery(sortBy: WorkspaceProjectSort): Pick<WorkspaceProjectsQuery, 'orderBy' | 'orderByType'> {
    switch (sortBy) {
      case 'oldest':
        return { orderBy: 'createdAt', orderByType: 'ASC' };
      case 'name_asc':
        return { orderBy: 'name', orderByType: 'ASC' };
      case 'name_desc':
        return { orderBy: 'name', orderByType: 'DESC' };
      case 'latest':
      default:
        return { orderBy: 'createdAt', orderByType: 'DESC' };
    }
  }

  async getWorkspaceProjects(
    workspaceId: WorkspaceId,
    query: WorkspaceProjectsQuery,
  ): Promise<WorkspaceProjectsResult> {
    if (USE_MOCK_WORKSPACE_PROJECTS) {
      return normalizeProjectsResponse(workspaceId, getMockWorkspaceProjectsResponse(query));
    }

    const response = await this.#newApi._get(this.#buildProjectsPath(workspaceId, query));
    const body = await response.json() as WorkspaceProjectsApiResponse;

    return normalizeProjectsResponse(workspaceId, body);
  }

  #buildProjectsPath(workspaceId: WorkspaceId, query: WorkspaceProjectsQuery) {
    const params = new URLSearchParams();

    if (query.status) {
      params.set('status', query.status);
    }

    if (query.textSearch) {
      params.set('textSearch', query.textSearch);
    }

    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('orderBy', query.orderBy);
    params.set('orderByType', query.orderByType);

    return `workspaces/${workspaceId}/tasking/projects?${params.toString()}`;
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
    config?: object,
  ): Promise<Response> {
    try {
      await this.#tdeiClient.tryRefreshAuth();
      this.#setAuthHeader();

      return await super._send(url, method, body, config);
    } catch (e) {
      if (e instanceof BaseHttpClientError) {
        throw new WorkspaceProjectsClientError(e.response);
      }

      throw e;
    }
  }
}
