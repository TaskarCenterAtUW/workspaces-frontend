import { BaseHttpClient, BaseHttpClientError } from '~/services/http';
import {
  getMockProjectNameAvailabilityResponse,
} from '~/services/mock-project-wizard';
import { buildProjectWizardCreatePayload } from '~/services/project-wizard-payload';

import type { ICancelableClient } from '~/services/loading';
import type { TdeiAuthStore, TdeiClient } from '~/services/tdei';
import type {
  ProjectWizardDraft,
  ProjectWizardCreatePayload,
  ProjectWizardNameAvailabilityResponse,
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
  ): Promise<void> {
    const payload = buildProjectWizardCreatePayload(draft);

    if (USE_MOCK_PROJECT_WIZARD) {
      await new Promise(resolve => setTimeout(resolve, 180));
      return;
    }

    await this.#createProjectRequest(workspaceId, payload);
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

  async #createProjectRequest(
    workspaceId: WorkspaceId,
    payload: ProjectWizardCreatePayload,
  ): Promise<void> {
    void workspaceId;
    void payload;
    throw new Error('Project creation endpoint is not configured yet.');
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
