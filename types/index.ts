// Shared TypeScript type definitions for the workspaces application

export interface Workspace {
  id: number
  name: string
  type: 'osw' | 'pathways'
  createdAt: Date
  createdBy: string
  createdByName: string
  tdeiProjectGroupId: string
  tdeiMetadata: TdeiMetadata | Record<string, unknown>
  tdeiRecordId?: string
  datasetName?: string
}

export interface TdeiMetadata {
  name?: string
  description?: string
  dataset_detail?: {
    name?: string
    version?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface TdeiDataset {
  tdei_dataset_id: string
  tdei_project_group_id: string
  name: string
  metadata: TdeiMetadata
  status: string
  [key: string]: unknown
}

export interface TdeiDatasetInfo {
  id: string
  name: string
  version: string
}

export interface TdeiProjectGroup {
  id: string
  name: string
}

export interface TdeiService {
  id: string
  name: string
}

export interface TdeiConversionJob {
  job_id: string
  status: string
  message: string
  [key: string]: unknown
}

export interface TdeiAuthResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  refresh_expires_in: number
}

export interface JwtBody {
  sub: string
  name: string
  email: string
  [key: string]: unknown
}

export interface DatasetArchive {
  dataset: Blob
  metadata?: {
    filename: string
    getData: (writer: unknown) => Promise<unknown>
  }
}

export interface OSMElement {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Record<string, string>
  [key: string]: unknown
}

export interface OSMBoundingBox {
  min_lon: number
  min_lat: number
  max_lon: number
  max_lat: number
}

export interface GtfsFile {
  filename: string
  content: string
}

export interface LongFormQuestSettings {
  [key: string]: unknown
}

export interface ImagerySettings {
  [key: string]: unknown
}

// HTTP Client types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type RequestBody =
  | Record<string, unknown>
  | FormData
  | Blob
  | string
  | null
  | undefined

export interface RequestConfig {
  headers?: Record<string, string>
  signal?: AbortSignal
  [key: string]: unknown
}
