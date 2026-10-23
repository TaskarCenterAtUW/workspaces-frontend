import parseOsmChangeXml from '@osmcha/osmchange-parser';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import type { OsmApiClient } from '~/services/osm';
import { buildPathwaysCsvArchive, fetchDerivedPathwaysDataset } from '~/services/pathways';
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
  /**
   * For a pathways workspace not made from a TDEI dataset: the agency's GTFS
   * feed (see `openAgencyFeed`), which supplies the rest of the feed TDEI's
   * validation needs.
   */
  agencyFeed?: Map<string, string>;
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
      // The message shown keeps only e.toString(); log the error for its stack.
      console.error(`TDEI export failed while: ${this._context.status}`, e);
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

    this._context.status = status.bbox;
    const bbox = await this._osmClient.getWorkspaceBbox(workspace.id);

    // No bounding box means the workspace has never held a node. The OSM reads
    // reduce that to an empty result rather than failing, which suits an
    // archive download but not an upload: an empty dataset published to TDEI
    // cannot be undone from here. The API computes the box over every node
    // version, deleted ones included, so a workspace whose data was all
    // deleted still has one and is not refused here.
    //
    if (!bbox) {
      throw new TdeiExporterValidationError(
        `Workspace "${workspace.title}" holds no data, so there is nothing to export. `
        + 'Add data to it, then export again.'
      );
    }

    if (!metadata.dataset_area) {
      const { min_lat, min_lon, max_lat, max_lon } = bbox;
      metadata.dataset_area = geojson.featureCollection([
        geojson.bboxToPolygon(min_lat, min_lon, max_lat, max_lon)
      ]);
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
      return await this._exportPathwaysToTdei(workspace, metadata, changesetArchive, options.agencyFeed);
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

  /**
   * Builds the workspace's GTFS on the TDEI dataset it was made from, or else on
   * the agency feed given. TDEI's validation needs a whole feed, so with
   * neither (e.g. the original dataset has since been deleted), it refuses
   * rather than publish placeholder agency and service files.
   */
  async _exportPathwaysToTdei(
    workspace: Workspace,
    metadata: any,
    changesetArchive?: Blob,
    agencyFeed?: Map<string, string>
  ): Promise<string> {
    const tdeiServiceId = this._requireServiceId(workspace);

    this._context.status = status.exportOsm;
    const elements = await this._osmClient.getWorkspaceData(workspace.id);
    this._context.status = status.checkDerived;
    const { datasetId: derivedFromDatasetId, files: derivedFromDataset }
      = await fetchDerivedPathwaysDataset(this._tdeiClient, workspace.tdeiRecordId);

    if (!derivedFromDataset && !agencyFeed) {
      throw new TdeiExporterValidationError(
        workspace.tdeiRecordId
          ? 'The TDEI dataset this workspace was made from no longer exists, so the rest of its GTFS feed '
          + '(agency, routes, trips, stop times and calendar) is missing. Choose the agency\'s GTFS feed to export with.'
          : 'This workspace wasn\'t made from a TDEI dataset. Choose the agency\'s GTFS feed to export with.'
      );
    }

    this._context.status = status.convertOsm;
    const csvZip = derivedFromDataset
      ? await buildPathwaysCsvArchive(elements, derivedFromDataset)
      : await buildPathwaysCsvArchive(elements, new Map(agencyFeed), { mergeWithFeed: true });

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
      const osmChange = await parseOsmChangeXml(osc);

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
