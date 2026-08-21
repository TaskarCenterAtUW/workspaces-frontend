import { resolveHttpErrorMessage } from '~/services/http';
import type { WorkspacesClient } from '~/services/workspaces';
import type { WorkspaceCreation } from '~/types/workspaces';

const status = {
  idle: 'Idle',
  uploading: 'Creating workspace and uploading dataset...',
  complete: 'Import complete.'
};

export class FileImporterContext {
  active!: boolean;
  status!: string;
  error!: string | null;

  constructor() {
    this.reset();
  }

  get complete(): boolean {
    return this.status === status.complete;
  }

  reset() {
    this.active = false;
    this.status = status.idle;
    this.error = null;
  }
}

export class FileImporter {
  private _workspacesClient: WorkspacesClient;
  private _context: FileImporterContext;

  constructor(
    workspacesClient: WorkspacesClient,
    context?: FileImporterContext
  ) {
    this._workspacesClient = workspacesClient;
    this._context = context ?? new FileImporterContext();
  }

  get context(): FileImporterContext {
    return this._context;
  }

  async import(data: Blob, workspace: WorkspaceCreation): Promise<number | undefined> {
    this._context.reset();
    this._context.active = true;

    try {
      return await this._run(data, workspace);
    } catch (e: unknown) {
      await this._handleError(e);
    } finally {
      this._context.active = false;
    }
  }

  async _run(data: Blob, workspace: WorkspaceCreation): Promise<number> {
    this._context.status = status.uploading;
    const workspaceId = await this._workspacesClient.createWorkspaceFromFile(data, workspace);
    this._context.status = status.complete;

    return workspaceId;
  }

  async _handleError(e: unknown) {
    this._context.error = await resolveHttpErrorMessage(e, 'Failed to create workspace from file.');
  }
}
