import { BaseHttpClient, BaseHttpClientError } from '~/services/http';
import { buildProjectWizardCreatePayload } from '~/services/project-wizard-payload';
import {
  convertCellSizeMetersToSquareKilometers,
  convertTaskAreaSquareKilometersToCellSizeMeters,
  createProjectWizardTaskAoiSignature,
  normalizeTaskAreaSquareKilometers,
} from '~/services/project-wizard-tasks';

import type { ICancelableClient } from '~/services/loading';
import type { TdeiAuthStore, TdeiClient } from '~/services/tdei';
import type {
  ProjectWizardDraft,
  ProjectWizardCreateResult,
  ProjectWizardCreatePayload,
  ProjectWizardNameAvailabilityResponse,
  ProjectWizardAreaFeature,
  ProjectWizardGeneratedTaskFeatureCollection,
  ProjectWizardTaskBoundarySource,
  ProjectWizardTaskGenerationSummary,
  ProjectWizardTaskSavePayload,
  ProjectWizardTaskSaveResponse,
  ProjectWizardTaskSaveSummary,
  ProjectWizardWorkspaceUser,
} from '~/types/project-wizard';
import type { WorkspaceId } from '~/types/workspaces';

interface ProjectWizardWorkspaceUserApiItem {
  id: number;
  auth_uid: string;
  email: string;
  display_name: string;
  role: ProjectWizardWorkspaceUser['role'];
}

interface ProjectWizardProjectsListApiItem {
  name: string;
}

interface ProjectWizardProjectsListApiResponse {
  results: ProjectWizardProjectsListApiItem[];
}

interface ProjectWizardCreateProjectApiResponse {
  id?: number | string;
  projectId?: number | string;
  project_id?: number | string;
  status?: string;
}

const PROJECT_WIZARD_TASK_SOURCE_GRID: ProjectWizardTaskBoundarySource = 'grid';

function normalizeWorkspaceUser(user: ProjectWizardWorkspaceUserApiItem): ProjectWizardWorkspaceUser {
  return {
    id: user.id,
    authUid: user.auth_uid,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
  };
}

function normalizeCreatedProject(response: ProjectWizardCreateProjectApiResponse): ProjectWizardCreateResult {
  const projectId = response.projectId ?? response.project_id ?? response.id;

  if (projectId === undefined || projectId === null || projectId === '') {
    throw new Error('Project creation response did not include a project id.');
  }

  return {
    projectId: String(projectId),
    status: 'draft',
  };
}

function buildSavedTaskGrid(
  tasks: ProjectWizardTaskSaveResponse['tasks'],
): ProjectWizardGeneratedTaskFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: tasks.map(task => ({
      type: 'Feature',
      geometry: task.geometry,
      properties: {
        areaSqkm: task.area_sqkm,
        status: task.status,
        taskId: task.id,
        taskNumber: task.task_number,
        updatedAt: task.updated_at,
      },
    })),
  };
}

export class ProjectWizardClient extends BaseHttpClient implements ICancelableClient {
  #tdeiClient: TdeiClient;

  constructor(apiUrl: string, tdeiClient: TdeiClient, signal?: AbortSignal) {
    super(apiUrl, signal);
    this.#tdeiClient = tdeiClient;
  }

  get auth(): TdeiAuthStore {
    return this.#tdeiClient.auth;
  }

  clone(signal?: AbortSignal): ProjectWizardClient {
    return new ProjectWizardClient(this._baseUrl, this.#tdeiClient, signal ?? this._abortSignal);
  }

  async listWorkspaceUsers(workspaceId: WorkspaceId): Promise<ProjectWizardWorkspaceUser[]> {
    const response = await this._get(`workspaces/${workspaceId}/users`);
    const items = await response.json() as ProjectWizardWorkspaceUserApiItem[];

    return items.map(normalizeWorkspaceUser);
  }

  async createProject(
    workspaceId: WorkspaceId,
    draft: ProjectWizardDraft,
  ): Promise<ProjectWizardCreateResult> {
    const payload = buildProjectWizardCreatePayload(draft);

    return await this.#createProjectRequest(workspaceId, payload);
  }

  async checkProjectNameAvailability(
    workspaceId: WorkspaceId,
    projectName: string,
  ): Promise<ProjectWizardNameAvailabilityResponse> {
    const normalizedName = projectName.trim().toLowerCase();

    if (normalizedName.length < 3) {
      return {
        available: false,
        message: 'Enter at least 3 characters',
      };
    }

    const params = new URLSearchParams({
      text_search: projectName.trim(),
      page: '1',
      page_size: '20',
      order_by: 'created_at',
      order_by_type: 'DESC',
    });
    const response = await this._get(`workspaces/${workspaceId}/tasking/projects?${params.toString()}`);
    const body = await response.json() as ProjectWizardProjectsListApiResponse;
    const existingProject = body.results.some(project => project.name.trim().toLowerCase() === normalizedName);

    return existingProject
      ? {
          available: false,
          message: 'Project name already exists',
        }
      : {
          available: true,
          message: 'Name available',
        };
  }

  async generateProjectTasks(
    workspaceId: WorkspaceId,
    projectId: string,
    aoi: ProjectWizardAreaFeature,
    requestedTaskAreaSquareKilometers: number,
  ): Promise<ProjectWizardTaskGenerationSummary> {
    return await this.#generateProjectTasksRequest(
      workspaceId,
      projectId,
      aoi,
      requestedTaskAreaSquareKilometers,
    );
  }

  async saveProjectTasks(
    workspaceId: WorkspaceId,
    projectId: string,
    taskGrid: ProjectWizardGeneratedTaskFeatureCollection,
  ): Promise<ProjectWizardTaskSaveSummary> {
    return await this.#saveProjectTasksRequest(workspaceId, projectId, taskGrid);
  }

  async #createProjectRequest(
    workspaceId: WorkspaceId,
    payload: ProjectWizardCreatePayload,
  ): Promise<ProjectWizardCreateResult> {
    const response = await this._post(`workspaces/${workspaceId}/tasking/projects`, payload);
    const body = await response.json() as ProjectWizardCreateProjectApiResponse;

    return normalizeCreatedProject(body);
  }

  async #generateProjectTasksRequest(
    workspaceId: WorkspaceId,
    projectId: string,
    aoi: ProjectWizardAreaFeature,
    requestedTaskAreaSquareKilometers: number,
  ): Promise<ProjectWizardTaskGenerationSummary> {
    const cellSizeMeters = convertTaskAreaSquareKilometersToCellSizeMeters(
      requestedTaskAreaSquareKilometers,
    );
    const params = new URLSearchParams({
      cell_size_meters: String(cellSizeMeters),
    });
    const response = await this._post(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/tasks/grid?${params.toString()}`,
    );
    const body = await response.json() as ProjectWizardGeneratedTaskFeatureCollection;
    const totalTasks = body.features.filter(feature => feature.geometry.type === 'Polygon').length;

    return {
      aoiSignature: createProjectWizardTaskAoiSignature(aoi),
      approximateTaskAreaSquareKilometers: convertCellSizeMetersToSquareKilometers(cellSizeMeters),
      generatedAt: new Date().toISOString(),
      requestedTaskAreaSquareKilometers: normalizeTaskAreaSquareKilometers(
        requestedTaskAreaSquareKilometers,
      ),
      taskGrid: body,
      totalTasks,
    };
  }

  async #saveProjectTasksRequest(
    workspaceId: WorkspaceId,
    projectId: string,
    taskGrid: ProjectWizardGeneratedTaskFeatureCollection,
  ): Promise<ProjectWizardTaskSaveSummary> {
    const payload: ProjectWizardTaskSavePayload = {
      source: PROJECT_WIZARD_TASK_SOURCE_GRID,
      feature_collection: taskGrid,
    };
    const response = await this._post(
      `workspaces/${workspaceId}/tasking/projects/${projectId}/tasks/save`,
      payload,
    );
    const body = await response.json() as ProjectWizardTaskSaveResponse;

    return {
      idempotencyKey: body.idempotency_key,
      replayed: body.replayed,
      savedAt: new Date().toISOString(),
      source: PROJECT_WIZARD_TASK_SOURCE_GRID,
      taskBoundaryType: body.task_boundary_type,
      taskCount: body.task_count,
      taskGrid: buildSavedTaskGrid(body.tasks),
    };
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
        throw e;
      }

      throw e;
    }
  }
}
