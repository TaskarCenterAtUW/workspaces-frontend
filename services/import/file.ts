import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js';

import { OsmApiClient, OsmApiClientError, osm2osc } from '~/services/osm';
import { openTdeiPathwaysArchive, pathways2osc } from '~/services/pathways';
import { TdeiClient, TdeiClientError, TdeiConversionError } from '~/services/tdei';
import { WorkspacesClient, WorkspacesClientError } from '~/services/workspaces';

const status = {
  idle: 'Idle',
  convertOsm: 'Converting dataset...',
  createWorkspace: 'Initializing workspace...',
  createChangeset: 'Creating changeset...',
  buildOsc: 'Building upload...',
  import: 'Importing dataset to workspace...',
  complete: 'Import complete.'
};

export class FileImporterContext {
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
  constructor(
    workspacesClient: WorkspacesClient,
    tdeiClient: TdeiClient,
    osmClient: OsmApiClient,
    context: FileImporterContext
  ) {
    this._workspacesClient = workspacesClient;
    this._tdeiClient = tdeiClient;
    this._osmClient = osmClient;
    this._context = context ?? new FileImporterContext();
  }

  get context(): FileImporterContext {
    return this._context;
  }

  async import(data: Blob, workspace): Promise<number> {
    this._context.reset();
    this._context.active = true;

    try {
      return await this._run(data, workspace);
    } catch (e: any) {
      await this._handleError(e);
    } finally {
      this._context.active = false;
    }
  }

  async _run(data: Blob, workspace): Promise<number> {
    if (workspace.type === 'osw') {
      this._context.status = status.convertOsm;
      data = await this._tdeiClient.convertDataset(data, 'osw', 'osm', workspace.tdeiProjectGroupId);
      data = await this._unwrapConvertedDataset(data);
    }

    this._context.status = status.createWorkspace;
    const workspaceId = await this._workspacesClient.createWorkspace(workspace);

    this._context.status = status.createChangeset;
    const changesetId = await this._osmClient.createChangeset(workspaceId);

    this._context.status = status.buildOsc;
    const changesetXml = workspace.type === 'osw'
      ? osm2osc(changesetId, await data.text())
      : pathways2osc(changesetId, await openTdeiPathwaysArchive(data));

    this._context.status = status.import;
    await this._osmClient.uploadChangeset(workspaceId, changesetId, changesetXml);

    return workspaceId
  }

  async _unwrapConvertedDataset(zip: Blob): Blob {
    const zipReader = new ZipReader(new BlobReader(zip));
    const entries = await zipReader.getEntries();
    const out =  await entries[0].getData(new BlobWriter());

    await zipReader.close();

    return out;
  }

  async _handleError(e: any) {
    if (this._context.status === status.convertOsm) {
      this._context.error = 'Conversion job failed: ';
    } else {
      this._context.error = 'Unexpected error: ';
    }

    if (e instanceof TdeiClientError
      || e instanceof OsmApiClientError
      || e instanceof WorkspacesClientError
    ) {
      this._context.error += await e.response.text();
    } else if (e instanceof TdeiConversionError) {
      this._context.error += e.job.message;
    } else {
      this._context.error += e.toString();
    }
  }
}
