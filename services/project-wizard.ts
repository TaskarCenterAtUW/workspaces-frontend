import { BaseHttpClient } from '~/services/http';
import {
  getMockProjectNameAvailabilityResponse,
} from '~/services/mock-project-wizard';
import { buildProjectWizardCreatePayload } from '~/services/project-wizard-payload';

import type { ICancelableClient } from '~/services/loading';
import type {
  ProjectWizardDraft,
  ProjectWizardCreatePayload,
  ProjectWizardNameAvailabilityResponse,
} from '~/types/project-wizard';
import type { WorkspaceId } from '~/types/workspaces';

const USE_MOCK_PROJECT_WIZARD = import.meta.env.VITE_USE_MOCK_PROJECT_WIZARD !== 'false';

export class ProjectWizardClient extends BaseHttpClient implements ICancelableClient {
  clone(signal?: AbortSignal): ProjectWizardClient {
    return new ProjectWizardClient(this._baseUrl, signal ?? this._abortSignal);
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
}
