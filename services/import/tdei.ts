import type { WorkspacesClient } from '~/services/workspaces';
import { WorkspacesClientError } from '~/services/workspaces';

import type { WorkspaceCreation } from '~/types/workspaces';

export class TdeiImporterContext {
  active: boolean = false;
  error?: string;

  reset() {
    this.active = false;
    this.error = undefined;
  }
}

export class TdeiImporter {
  readonly _workspacesClient: WorkspacesClient;
  readonly _context: TdeiImporterContext;

  constructor(
    workspacesClient: WorkspacesClient,
    context: TdeiImporterContext
  ) {
    this._workspacesClient = workspacesClient;
    this._context = context ?? new TdeiImporterContext();
  }

  get context(): TdeiImporterContext {
    return this._context;
  }

  async import(workspace: WorkspaceCreation): Promise<number | undefined> {
    this._context.reset();
    this._context.active = true;

    try {
      return await this._run(workspace);
    } catch (e: any) {
      await this._handleError(e);
    } finally {
      this._context.active = false;
    }
  }

  async _run(workspace: WorkspaceCreation): Promise<number> {
    const workspaceId = await this._workspacesClient.createWorkspace(workspace);
    return workspaceId;
  }

  async _handleError(e: any) {
    this._context.error = 'Unexpected error: ';

    if (e instanceof WorkspacesClientError) {
      this._context.error += await e.response.text();
    } else {
      this._context.error += e.toString();
    }
  }
}
