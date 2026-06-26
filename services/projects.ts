import { BaseHttpClient, BaseHttpClientError } from '~/services/http';
import { getMockWorkspaceProjectsResponse } from '~/services/mock-workspace-projects';

import type { ICancelableClient } from '~/services/loading';
import type { TdeiAuthStore, TdeiClient } from '~/services/tdei';
import type {
  WorkspaceProjectAoiApiResponse,
  WorkspaceProjectAoiFeature,
  WorkspaceProjectContributor,
  WorkspaceProjectContributorRole,
  WorkspaceProjectDetail,
  WorkspaceProjectDetailApiItem,
  WorkspaceProject,
  WorkspaceProjectApiItem,
  WorkspaceProjectRoleApiItem,
  WorkspaceProjectRolesApiResponse,
  WorkspaceProjectTaskApiItem,
  WorkspaceProjectTaskDetail,
  WorkspaceProjectTaskListItem,
  WorkspaceProjectTaskSubmitPayload,
  WorkspaceProjectTasksApiResponse,
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

function normalizeTaskStatus(status: WorkspaceProjectTaskApiItem['status']): WorkspaceProjectTaskListItem['status'] {
  switch (status) {
    case 'to_validate':
      return 'ready_for_validation';
    case 'more_mapping_needed':
      return 'needs_more_mapping';
    case 'done':
      return 'completed';
     case 'completed':
      return 'completed';
    case 'to_review':
      return 'ready_for_validation'
    case 'to_map':
    default:
      return 'ready_for_mapping';
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

function normalizeProjectDetail(
  workspaceId: WorkspaceId,
  project: WorkspaceProjectDetailApiItem,
): WorkspaceProjectDetail {
  return {
    id: project.id,
    workspaceId,
    name: project.name,
    summary: undefined,
    status: normalizeStatus(project.status),
    taskCount: project.task_count,
    percentCompleted: project.percent_completed ?? 0,
    createdBy: project.created_by,
    createdByName: project.created_by_name ?? '',
    createdAt: new Date(project.created_at),
    updatedAt: new Date(project.updated_at),
    instructions: project.instructions,
    reviewRequired: project.review_required,
    lockTimeoutHours: project.lock_timeout_hours,
    taskBoundaryType: project.task_boundary_type,
    hasAoi: project.has_aoi,
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

function formatProjectTaskDate(value: string): string {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function normalizeProjectTask(task: WorkspaceProjectTaskApiItem): WorkspaceProjectTaskListItem {
  return {
    id: String(task.id),
    label: `Task #${task.task_number}`,
    status: normalizeTaskStatus(task.status),
    geometry: task.geometry,
    taskNumber: task.task_number,
    // While a task is actively locked, the UI should show the current lock owner instead of a
    // historical mapper so the list matches the real live task ownership state.
    mapperName: task.last_mapper?.user_name ?? 'Unassigned',
    updatedAt: formatProjectTaskDate(task.updated_at),
    lock: task.lock,
    locked: task.lock !== null,
  };
}

function normalizeProjectTaskDetail(task: WorkspaceProjectTaskApiItem): WorkspaceProjectTaskDetail {
  return {
    ...normalizeProjectTask(task),
    areaSquareKilometers: task.area_sqkm,
    createdAt: new Date(task.created_at),
    lastMapperName: task.last_mapper?.user_name ?? null,
    updatedAtIso: task.updated_at,
  };
}

function normalizeProjectContributor(role: WorkspaceProjectRoleApiItem): WorkspaceProjectContributor {
  return {
    id: role.user_id,
    name: role.user_name,
    role: role.role,
    updatedAt: new Date(role.updated_at),
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
  #taskingApiUrl: string;

  constructor(taskingApiUrl: string, tdeiClient: TdeiClient, signal?: AbortSignal) {
    super(taskingApiUrl, signal);
    this.#tdeiClient = tdeiClient;
    // All methods in this client target tasking/project endpoints, so keep one canonical
    // tasking base URL and do not bounce between legacy and new backends internally.
    this.#taskingApiUrl = taskingApiUrl;
  }

  get auth(): TdeiAuthStore {
    return this.#tdeiClient.auth;
  }

  clone(signal?: AbortSignal): WorkspaceProjectsClient {
    return new WorkspaceProjectsClient(
      this.#taskingApiUrl,
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

    const response = await this._get(this.#buildProjectsPath(workspaceId, query));
    const body = await response.json() as WorkspaceProjectsApiResponse;

    return normalizeProjectsResponse(workspaceId, body);
  }

  async getWorkspaceProjectDetail(
    workspaceId: WorkspaceId,
    projectId: number | string,
  ): Promise<WorkspaceProjectDetail> {
    const response = await this._get(
      `workspaces/${workspaceId}/tasking/projects/${projectId}`,
    );
    const body = await response.json() as WorkspaceProjectDetailApiItem;

    return normalizeProjectDetail(workspaceId, body);
  }

  /**
   * Open a draft project for tasking.
   * We normalize the response like any other detail payload so callers can replace the local
   * project detail state directly.
   */
  async activateWorkspaceProject(
    workspaceId: WorkspaceId,
    projectId: number | string,
  ): Promise<WorkspaceProjectDetail> {
    const response = await this._post(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/activate`,
    );
    const body = await response.json() as WorkspaceProjectDetailApiItem;

    return normalizeProjectDetail(workspaceId, body);
  }

  async getWorkspaceProjectAoi(
    workspaceId: WorkspaceId,
    projectId: number | string,
  ): Promise<WorkspaceProjectAoiFeature> {
    const response = await this._get(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/aoi`,
    );
    const body = await response.json() as WorkspaceProjectAoiApiResponse;

    return {
      type: 'Feature',
      geometry: body.geometry,
      properties: body.properties ?? {},
    };
  }

  async getWorkspaceProjectTasks(
    workspaceId: WorkspaceId,
    projectId: number | string,
  ): Promise<WorkspaceProjectTaskListItem[]> {
    const params = new URLSearchParams({
      page: '1',
      page_size: '200',
    });
    const response = await this._get(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/tasks?${params.toString()}`,
    );
    const body = await response.json() as WorkspaceProjectTasksApiResponse;

    return body.tasks.map(normalizeProjectTask);
  }

  async getWorkspaceProjectRoles(
    workspaceId: WorkspaceId,
    projectId: number | string,
  ): Promise<WorkspaceProjectContributor[]> {
    const response = await this._get(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/roles`,
    );
    const body = await response.json() as WorkspaceProjectRolesApiResponse;

    return body.results.map(normalizeProjectContributor);
  }

  /**
   * Fetch the project-level role for a single user.
   * Returns null when the user has no explicit project role (API responds with 404).
   */
  async getWorkspaceProjectUserRole(
    workspaceId: WorkspaceId,
    projectId: number | string,
    userId: string,
  ): Promise<WorkspaceProjectContributorRole | null> {
    try {
      const response = await this._get(
        `workspaces/${workspaceId}/tasking/projects/${projectId}/roles/${userId}`,
      );
      const body = await response.json() as WorkspaceProjectRoleApiItem;
      return body.role as WorkspaceProjectContributorRole;
    }
    catch {
      // 404 or network error → user has no explicit project role; treat as null.
      return null;
    }
  }

  async updateWorkspaceProjectRole(
    workspaceId: WorkspaceId,
    projectId: number | string,
    userId: string,
    role: WorkspaceProjectContributor['role'],
  ): Promise<void> {
    await this._put(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/roles/${userId}`,
      { role },
    );
  }

  async addWorkspaceProjectRole(
    workspaceId: WorkspaceId,
    projectId: number | string,
    payload: {
      role: WorkspaceProjectContributor['role'];
      userId: string;
    },
  ): Promise<void> {
    await this._post(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/roles`,
      {
        user_id: payload.userId,
        role: payload.role,
      },
    );
  }

  async deleteWorkspaceProjectRole(
    workspaceId: WorkspaceId,
    projectId: number | string,
    userId: string,
  ): Promise<void> {
    await this._delete(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/roles/${userId}`,
    );
  }

  /**
   * Read the canonical payload for one selected task so task-specific screens do not need to
   * pull the full project task collection just to show a sidebar summary.
   */
  async getWorkspaceProjectTaskDetail(
    workspaceId: WorkspaceId,
    projectId: number | string,
    taskId: number | string,
  ): Promise<WorkspaceProjectTaskDetail> {
    const response = await this._get(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/tasks/${taskId}`,
    );
    const body = await response.json() as WorkspaceProjectTaskApiItem;

    return normalizeProjectTaskDetail(body);
  }

  async lockWorkspaceProjectTask(
    workspaceId: WorkspaceId,
    projectId: number | string,
    taskNumber: number,
  ): Promise<WorkspaceProjectTaskListItem> {
    const response = await this._post(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/tasks/${taskNumber}/lock`,
    );
    const body = await response.json() as WorkspaceProjectTaskApiItem;

    return normalizeProjectTask(body);
  }

  async unlockWorkspaceProjectTask(
    workspaceId: WorkspaceId,
    projectId: number | string,
    taskNumber: number,
    force: boolean = false,
  ): Promise<void> {
    const params = new URLSearchParams({
      force: String(force),
    });

    await this._delete(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/tasks/${taskNumber}/lock?${params.toString()}`,
    );
  }

  async submitWorkspaceProjectTask(
    workspaceId: WorkspaceId,
    projectId: number | string,
    taskNumber: number,
    payload: WorkspaceProjectTaskSubmitPayload,
  ): Promise<void> {
    await this._post(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/tasks/${taskNumber}/submit`,
      {
        osm_changeset_id: payload.osmChangesetId,
        done: payload.done,
        feedback: payload.feedback
          ? {
              notes: payload.feedback.notes,
              reason_category: payload.feedback.reasonCategory,
            }
          : undefined,
      },
    );
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
    body?: unknown,
    config?: RequestInit,
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
