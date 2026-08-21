import { BlobReader, ZipReader } from '@zip.js/zip.js';
import { resolveHttpErrorMessage } from '~/services/http';
import type { WorkspacesClient } from '~/services/workspaces';
import type { WorkspaceCreation, WorkspaceType } from '~/types/workspaces';

export interface DatasetArchiveInspection {
  filenames: string[];
  hasMetadata: boolean;
}

export async function inspectDatasetArchive(data: Blob): Promise<DatasetArchiveInspection> {
  const reader = new ZipReader(new BlobReader(data));

  try {
    const entries = await reader.getEntries();
    const filenames = entries
      .filter(entry => !entry.directory)
      .map(entry => entry.filename.toLowerCase());

    return {
      filenames,
      hasMetadata: filenames.some((filename) => {
        const basename = filename.split(/[\\/]/).at(-1);
        return basename === 'metadata.json';
      })
    };
  } finally {
    await reader.close();
  }
}

export function getDatasetArchiveWarning(
  inspection: DatasetArchiveInspection,
  datasetType: WorkspaceType | null
): string | null {
  if (inspection.hasMetadata) {
    return 'This ZIP contains metadata.json and may be a direct TDEI dataset download. Upload the dataset ZIP contained inside it instead.';
  }

  if (datasetType === 'pathways' && !inspection.filenames.some(name => name.endsWith('.txt'))) {
    return 'This ZIP does not contain any .txt files expected for a GTFS Pathways dataset.';
  }

  if (datasetType === 'osw' && !inspection.filenames.some(name => name.endsWith('.geojson'))) {
    return 'This ZIP does not contain any .geojson files expected for an OpenSidewalks dataset.';
  }

  return null;
}

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
