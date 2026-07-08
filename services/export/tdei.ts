import parseOsmChangeXml from '@osmcha/osmchange-parser';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import type { OsmApiClient } from '~/services/osm';
import { buildPathwaysCsvArchive, openTdeiPathwaysArchive } from '~/services/pathways';
import type { TdeiClient } from '~/services/tdei';
import { TdeiClientError, TdeiConversionError } from '~/services/tdei';
import type { TdeiDatasetMetadataDatasetDetail } from '~/types/tdei';
import type { Workspace } from '~/types/workspaces';
import * as geojson from '~/util/geojson'

export class TdeiExporterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TdeiExporterValidationError';
  }
}

interface AdaCertificationInfo {
  certifiedBy: string;
  certifiedByName: string;
  certifiedAt: string;
}

interface ExportOptions {
  includeChangesets?: boolean;
  includeRawOsc?: boolean;
  adaCertification?: AdaCertificationInfo;
}

const status = {
  idle: 'Idle',
  validate: 'Validating...',
  bbox: 'Finding workspace bounds...',
  collectChangesets: 'Collecting changesets...',
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

  async upload(
    workspace: Workspace,
    metadata: TdeiDatasetMetadataDatasetDetail,
    options: ExportOptions = {}
  ): Promise<string | undefined> {
    this._context.reset();
    this._context.active = true;

    try {
      return await this._run(workspace, metadata, options);
    } catch (e: any) {
      if (e instanceof TdeiExporterValidationError) {
        this._context.error = e.message;
      } else {
        if (this._context.status === status.collectChangesets) {
          this._context.error = 'Failed to collect changesets: ';
        } else if (this._context.status === status.convertOsm) {
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
      }
    } finally {
      this._context.active = false;
    }
  }

  private _validate(workspace: Workspace): asserts workspace is Workspace & { tdeiServiceId: string } {
    if (!workspace.tdeiProjectGroupId) {
      throw new TdeiExporterValidationError('This workspace does not have a TDEI project group assigned.');
    }
    if (!workspace.tdeiServiceId) {
      throw new TdeiExporterValidationError('This workspace does not have a TDEI service assigned. Please select a service before exporting.');
    }
  }

  private async _run(
    workspace: Workspace,
    metadata: TdeiDatasetMetadataDatasetDetail,
    options: ExportOptions
  ): Promise<string> {
    this._context.status = status.validate;
    this._validate(workspace);

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

    let changesetArchive: Blob | undefined;

    if (options.includeChangesets || options.adaCertification) {
      this._context.status = status.collectChangesets;
      changesetArchive = await this._buildChangesetArchive(
        workspace,
        options.includeRawOsc ?? false,
        options.adaCertification
      );
    }

    if (workspace.type === 'pathways') {
      return await this._exportPathwaysToTdei(workspace, metadata, changesetArchive);
    }

    return await this._exportOswToTdei(workspace, metadata, changesetArchive);
  }

  async _exportOswToTdei(workspace: Workspace, metadata: any, changesetArchive?: Blob): Promise<string> {
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
      { dataset_detail: metadata },
      changesetArchive
    );

    this._context.status = status.complete;

    return jobId
  }

  async _exportPathwaysToTdei(workspace: Workspace, metadata: any, changesetArchive?: Blob): Promise<string> {
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
      { dataset_detail: metadata },
      changesetArchive
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

  private async _buildChangesetArchive(workspace: Workspace, includeRawOsc: boolean, adaCertification?: AdaCertificationInfo): Promise<Blob> {
    const changesets = await this._osmClient.listChangesets(workspace.id);

    const manifest = {
      workspace: {
        id: workspace.id,
        title: workspace.title,
        description: workspace.description,
        type: workspace.type,
        tdeiProjectGroupId: workspace.tdeiProjectGroupId,
        tdeiServiceId: workspace.tdeiServiceId,
        tdeiRecordId: workspace.tdeiRecordId,
        createdAt: workspace.createdAt,
        createdBy: workspace.createdBy,
        createdByName: workspace.createdByName,
      },
      exportedAt: new Date().toISOString(),
      includesRawOsmChange: includeRawOsc,
      adaCertification: adaCertification ?? null,
      changesets,
    };

    const files = new Map<string, string>();
    files.set('manifest.json', JSON.stringify(manifest, null, 2));

    // Provide the more-friendly JSON format by default. A super user can opt-
    // in to the osmChange format if they wish to use those with OSM tooling:
    //
    await Promise.all(changesets.map(async (cs) => {
      const osc = await this._osmClient.downloadOsmChange(workspace.id, cs.id);
      const osmChange = parseOsmChangeXml(osc);

      files.set(`changesets/${cs.id}.json`, JSON.stringify(osmChange));

      if (includeRawOsc) {
        files.set(`changesets/${cs.id}.osc`, osc);
      }
    }));

    const blobWriter = new BlobWriter('application/zip');
    const zipWriter = new ZipWriter(blobWriter);

    await Promise.all(
      [...files].map(
        ([name, content]) => zipWriter.add(name, new TextReader(content))
      )
    );
    await zipWriter.close();

    return await blobWriter.getData();
  }
}
