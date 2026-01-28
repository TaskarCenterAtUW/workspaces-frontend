import { type OsmApiClient, OsmApiClientError, osm2osc } from '~/services/osm'
import { openTdeiPathwaysArchive, pathways2osc } from '~/services/pathways'
import { type TdeiClient, TdeiClientError } from '~/services/tdei'
import { type WorkspacesClient, WorkspacesClientError } from '~/services/workspaces'
import type { Workspace } from '~/types'

const status = {
  idle: 'Idle',
  createWorkspace: 'Initializing workspace...',
  downloadDataset: 'Downloading dataset from TDEI...',
  extractDataset: 'Extracting dataset archive...',
  createChangeset: 'Creating changeset...',
  buildOsc: 'Building upload...',
  import: 'Importing dataset to workspace...',
  complete: 'Import complete.',
}

export class TdeiImporterContext {
  constructor() {
    this.reset()
  }

  get complete(): boolean {
    return this.status === status.complete
  }

  reset() {
    this.active = false
    this.status = status.idle
    this.error = null
  }
}

export class TdeiImporter {
  constructor(
    workspacesClient: WorkspacesClient,
    tdeiClient: TdeiClient,
    osmClient: OsmApiClient,
    context: TdeiImporterContext,
  ) {
    this._workspacesClient = workspacesClient
    this._tdeiClient = tdeiClient
    this._osmClient = osmClient
    this._context = context ?? new TdeiImporterContext()
  }

  get context(): TdeiImporterContext {
    return this._context
  }

  async import(workspace: Partial<Workspace>): Promise<number | undefined> {
    this._context.reset()
    this._context.active = true

    try {
      return await this._run(workspace)
    }
    catch (e: unknown) {
      await this._handleError(e)
      return undefined
    }
    finally {
      this._context.active = false
    }
  }

  async _run(workspace: Partial<Workspace>): Promise<number> {
    // Create the workspace in parallel:
    const workspacePromise = this._workspacesClient.createWorkspace(workspace)

    this._context.status = status.downloadDataset
    const datasetZip = workspace.type === 'osw'
      ? await this._tdeiClient.downloadOswDataset(workspace.tdeiRecordId!, 'osm')
      : await this._tdeiClient.downloadPathwaysDataset(workspace.tdeiRecordId!)

    this._context.status = status.extractDataset
    const { dataset } = await this._tdeiClient.openDatasetArchive(datasetZip)

    this._context.status = status.createWorkspace
    const workspaceId = await workspacePromise

    this._context.status = status.createChangeset
    const changesetId = await this._osmClient.createChangeset(workspaceId)

    this._context.status = status.buildOsc
    const changesetXml = workspace.type === 'osw'
      ? osm2osc(changesetId, await dataset.text())
      : pathways2osc(changesetId, await openTdeiPathwaysArchive(dataset))

    this._context.status = status.import
    await this._osmClient.uploadChangeset(workspaceId, changesetId, changesetXml)

    return workspaceId
  }

  async _handleError(e: unknown): Promise<void> {
    this._context.error = 'Unexpected error: '

    if (e instanceof TdeiClientError
      || e instanceof OsmApiClientError
      || e instanceof WorkspacesClientError
    ) {
      this._context.error += await e.response.text()
    }
    else {
      this._context.error += String(e)
    }
  }
}
