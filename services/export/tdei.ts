import type { OsmApiClient } from '~/services/osm';
import { buildPathwaysCsvArchive, openTdeiPathwaysArchive } from '~/services/pathways';
import type { TdeiClient } from '~/services/tdei';
import { TdeiClientError, TdeiConversionError } from '~/services/tdei';
import type { Workspace } from '~/types/workspaces';
import * as geojson from '~/util/geojson'

const status = {
  idle: 'Idle',
  bbox: 'Finding workspace bounds...',
  exportOsm: 'Fetching workspace data...',
  convertOsm: 'Converting workspace data...',
  checkDerived: 'Checking previous dataset...',
  downloadDerived: 'Fetching previous dataset...',
  upload: 'Uploading dataset to TDEI...',
  complete: 'Upload complete.'
};

export class TdeiExporterContext {
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

export class TdeiExporter {
  private _tdeiClient: TdeiClient;
  private _osmClient: OsmApiClient;
  private _context: TdeiExporterContext;

  constructor(
    tdeiClient: TdeiClient,
    osmClient: OsmApiClient,
    context: TdeiExporterContext
  ) {
    this._tdeiClient = tdeiClient;
    this._osmClient = osmClient;
    this._context = context ?? new TdeiExporterContext();
  }

  get context(): TdeiExporterContext {
    return this._context;
  }

  async upload(workspace: Workspace, metadata: any): Promise<string | undefined> {
    this._context.reset();
    this._context.active = true;

    try {
      return await this._run(workspace, metadata);
    } catch (e: any) {
      if (this._context.status === status.convertOsm) {
        this._context.error = 'Conversion job failed: ';
      } else if (this._context.status === status.upload) {
        this._context.error = 'TDEI rejected the upload: ';
      } else {
        this._context.error = 'Unexpected error: ';
      }

      if (e instanceof TdeiClientError) {
        this._context.error += await e.response.text();
      } else if (e instanceof TdeiConversionError) {
        this._context.error += e.job.message;
      } else {
        this._context.error += e.toString();
      }
    } finally {
      this._context.active = false;
    }
  }

  async _run(workspace: Workspace, metadata: any): Promise<string> {
    if (!metadata.dataset_area) {
      this._context.status = status.bbox;
      const bbox = await this._osmClient.getWorkspaceBbox(workspace.id);

      if (bbox) {
        const { min_lat, min_lon, max_lat, max_lon } = bbox
        metadata.dataset_area = geojson.featureCollection([
          geojson.bboxToPolygon(min_lat, min_lon, max_lat, max_lon)
        ])
      }
    }

    if (workspace.type === 'pathways') {
      return await this._exportPathwaysToTdei(workspace, metadata);
    }

    return await this._exportOswToTdei(workspace, metadata);
  }

  async _exportOswToTdei(workspace: Workspace, metadata: any): Promise<string> {
    const tdeiServiceId = this._requireServiceId(workspace);

    this._context.status = status.exportOsm;
    const osm = await this._osmClient.exportWorkspaceXml(workspace.id);

    this._context.status = status.convertOsm;
    const oswZip = await this._tdeiClient.convertDataset(osm, 'osm', 'osw', workspace.tdeiProjectGroupId);

    this._context.status = status.upload;
    const jobId = await this._tdeiClient.uploadOswDataset(
      (await this._filterNonexistentDataset(workspace.tdeiRecordId)),
      workspace.tdeiProjectGroupId,
      tdeiServiceId,
      oswZip,
      { dataset_detail: metadata }
    );

    this._context.status = status.complete;

    return jobId
  }

  async _exportPathwaysToTdei(workspace: Workspace, metadata: any): Promise<string> {
    const tdeiServiceId = this._requireServiceId(workspace);

    this._context.status = status.exportOsm;
    const elements = await this._osmClient.getWorkspaceData(workspace.id);
    const derivedFromDatasetId = await this._filterNonexistentDataset(workspace.tdeiRecordId);
    const derivedFromDataset = await this._fetchPathwaysDataset(derivedFromDatasetId);

    this._context.status = status.convertOsm;
    const csvZip = await buildPathwaysCsvArchive(elements, derivedFromDataset);

    this._context.status = status.upload;
    const jobId = await this._tdeiClient.uploadPathwaysDataset(
      derivedFromDatasetId,
      workspace.tdeiProjectGroupId,
      tdeiServiceId,
      csvZip,
      { dataset_detail: metadata }
    );

    this._context.status = status.complete;

    return jobId
  }

  // The TDEI upload endpoints require a service id to build the request URL.
  // Validate it up front so we fail fast with a clear message instead of
  // sending `undefined` onward to the service layer.
  _requireServiceId(workspace: Workspace): string {
    if (!workspace.tdeiServiceId) {
      throw new Error(
        `Workspace ${workspace.id} has no TDEI service id; cannot export to TDEI.`
      );
    }

    return workspace.tdeiServiceId;
  }

  async _filterNonexistentDataset(tdeiRecordId: string | undefined): Promise<string | undefined> {
    if (!tdeiRecordId) {
      return undefined;
    }

    const oldStatus = this._context.status;

    this._context.status = status.checkDerived;
    const result = await this._tdeiClient.getDatasetInfo(tdeiRecordId);
    this._context.status = oldStatus;

    if (typeof result === 'object') {
      return tdeiRecordId;
    }

    return undefined;
  }

  async _fetchPathwaysDataset(tdeiRecordId: string | undefined) {
    if (!tdeiRecordId) {
      return undefined;
    }

    const zip = await this._tdeiClient.downloadPathwaysDataset(tdeiRecordId);
    const { dataset } = await this._tdeiClient.openDatasetArchive(zip);

    if (!dataset) {
      return undefined;
    }

    return await openTdeiPathwaysArchive(dataset, false, false);
  }
}
