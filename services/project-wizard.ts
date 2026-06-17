import { BaseHttpClient, BaseHttpClientError } from '~/services/http';
import {
  createMockProjectWizardProject,
  generateMockProjectWizardTasks,
  getMockProjectNameAvailabilityResponse,
} from '~/services/mock-project-wizard';
import { buildProjectWizardCreatePayload } from '~/services/project-wizard-payload';

import type { ICancelableClient } from '~/services/loading';
import type { TdeiAuthStore, TdeiClient } from '~/services/tdei';
import type {
  ProjectWizardDraft,
  ProjectWizardCreateResult,
  ProjectWizardCreatePayload,
  ProjectWizardNameAvailabilityResponse,
  ProjectWizardAreaFeature,
  ProjectWizardTaskGenerationSummary,
} from '~/types/project-wizard';
import type { WorkspaceId } from '~/types/workspaces';

const USE_MOCK_PROJECT_WIZARD = import.meta.env.VITE_USE_MOCK_PROJECT_WIZARD !== 'false';

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

  async createProject(
    workspaceId: WorkspaceId,
    draft: ProjectWizardDraft,
  ): Promise<ProjectWizardCreateResult> {
    const payload = buildProjectWizardCreatePayload(draft);

    if (USE_MOCK_PROJECT_WIZARD) {
      return await createMockProjectWizardProject(payload);
    }

    return await this.#createProjectRequest(workspaceId, payload);
  }

  async checkProjectNameAvailability(
    workspaceId: WorkspaceId,
    projectName: string,
  ): Promise<ProjectWizardNameAvailabilityResponse> {
    if (USE_MOCK_PROJECT_WIZARD) {
      return await getMockProjectNameAvailabilityResponse(projectName);
    }

    throw new Error(`Project name availability API not implemented for workspace ${workspaceId}.`);
  }

  async generateProjectTasks(
    workspaceId: WorkspaceId,
    projectId: string,
    aoi: ProjectWizardAreaFeature,
    requestedTaskAreaSquareKilometers: number,
  ): Promise<ProjectWizardTaskGenerationSummary> {
    if (USE_MOCK_PROJECT_WIZARD) {
      return await generateMockProjectWizardTasks(
        projectId,
        aoi,
        requestedTaskAreaSquareKilometers,
      );
    }

    return await this.#generateProjectTasksRequest(
      workspaceId,
      projectId,
      aoi,
      requestedTaskAreaSquareKilometers,
    );
  }

  async #createProjectRequest(
    workspaceId: WorkspaceId,
    payload: ProjectWizardCreatePayload,
  ): Promise<ProjectWizardCreateResult> {
    void workspaceId;
    void payload;
    throw new Error('Project creation endpoint is not configured yet.');
  }

  async #generateProjectTasksRequest(
    workspaceId: WorkspaceId,
    projectId: string,
    aoi: ProjectWizardAreaFeature,
    requestedTaskAreaSquareKilometers: number,
  ): Promise<ProjectWizardTaskGenerationSummary> {
    void workspaceId;
    void projectId;
    void aoi;
    void requestedTaskAreaSquareKilometers;
    throw new Error('Task generation endpoint is not configured yet.');
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
