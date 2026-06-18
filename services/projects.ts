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
const USE_MOCK_WORKSPACE_PROJECTS = import.meta.env.VITE_USE_MOCK_WORKSPACE_PROJECTS === 'true';

function normalizeStatus(status: WorkspaceProjectApiItem['status']): WorkspaceProject['status'] {
  switch (status) {
    case 'open':
      return 'in_progress';
    case 'done':
      return 'completed';
    case 'draft':
      return 'draft';
    default:
      console.warn(`Unknown project status "${status}" normalized to "draft"`);
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
    taskCount: project.task_count,
    percentCompleted: project.percent_completed,
    createdBy: project.created_by,
    createdByName: project.created_by_name ?? '',
    createdAt: new Date(project.created_at),
    updatedAt: new Date(project.updated_at),
  };
}

function normalizeProjectsResponse(
  workspaceId: WorkspaceId,
  response: WorkspaceProjectsApiResponse,
): WorkspaceProjectsResult {
  return {
    results: response.results.map(project => normalizeProject(workspaceId, project)),
    pagination: {
      page: response.pagination.page,
      pageSize: response.pagination.page_size,
      total: response.pagination.total,
    },
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
        return { orderBy: 'created_at', orderByType: 'ASC' };
      case 'name_asc':
        return { orderBy: 'name', orderByType: 'ASC' };
      case 'name_desc':
        return { orderBy: 'name', orderByType: 'DESC' };
      case 'latest':
      default:
        return { orderBy: 'created_at', orderByType: 'DESC' };
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
      params.set('text_search', query.textSearch);
    }

    params.set('page', String(query.page));
    params.set('page_size', String(query.pageSize));
    params.set('order_by', query.orderBy);
    params.set('order_by_type', query.orderByType);

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
