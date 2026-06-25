import type {
  Feature,
  MultiPolygon,
  Polygon,
} from 'geojson';

import type { WorkspaceId, WorkspaceRole } from '~/types/workspaces';

export type WorkspaceProjectStatus = 'draft' | 'in_progress' | 'completed';
export type WorkspaceProjectView = 'grid' | 'list';
export type WorkspaceProjectSort = 'latest' | 'oldest' | 'name_asc' | 'name_desc';
export type WorkspaceProjectsApiStatus = 'draft' | 'open' | 'done';
export type WorkspaceProjectsQueryStatus = WorkspaceProjectsApiStatus;
export type WorkspaceProjectsOrderBy = 'created_at' | 'name';
export type WorkspaceProjectsOrderByType = 'ASC' | 'DESC';
export type WorkspaceProjectDetailTab = 'overview' | 'instructions' | 'tasks' | 'contributions' | 'contributors';
export type WorkspaceProjectTaskStatus =
  | 'ready_for_mapping'
  | 'ready_for_validation'
  | 'needs_more_mapping'
  | 'completed';
export type WorkspaceProjectContributorRole = WorkspaceRole;
export type WorkspaceProjectContributorApiRole = WorkspaceRole;
export type WorkspaceProjectTaskApiStatus = 'to_map' | 'to_validate' | 'more_mapping_needed' | 'done'|'completed'| 'to_review';
export type WorkspaceProjectTaskFeedbackReasonCategory =
  | 'incomplete_mapping'
  | 'data_quality_issue'
  | 'wrong_area'
  | 'other';
export type WorkspaceProjectAoiFeature = Feature<Polygon | MultiPolygon>;

export interface WorkspaceProjectApiItem {
  id: number;
  name: string;
  status: WorkspaceProjectsApiStatus;
  task_count: number;
  percent_completed: number;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceProjectDetailApiItem {
  id: number;
  workspace_id: number;
  name: string;
  instructions: string;
  status: WorkspaceProjectsApiStatus;
  review_required: boolean;
  lock_timeout_hours: number;
  task_boundary_type: string;
  has_aoi: boolean;
  task_count: number;
  percent_completed?: number | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceProjectTaskApiLock {
  user_id: string;
  user_name: string;
  locked_at: string;
  expires_at: string;
}

export interface WorkspaceProjectTaskApiMapper {
  user_id: string;
  user_name: string;
}

export interface WorkspaceProjectTaskApiItem {
  id: number;
  task_number: number;
  status: WorkspaceProjectTaskApiStatus;
  geometry: Polygon;
  area_sqkm: number;
  lock: WorkspaceProjectTaskApiLock | null;
  last_mapper: WorkspaceProjectTaskApiMapper | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceProjectRoleApiItem {
  user_id: string;
  user_name: string;
  role: WorkspaceProjectContributorApiRole;
  updated_at: string;
}

export interface WorkspaceProjectRolesApiResponse {
  results: WorkspaceProjectRoleApiItem[];
}

export interface WorkspaceProjectTasksApiResponse {
  tasks: WorkspaceProjectTaskApiItem[];
  pagination: WorkspaceProjectsApiPagination;
}

export interface WorkspaceProjectAoiApiResponse {
  type: 'Feature';
  geometry: Polygon | MultiPolygon;
  properties: Record<string, unknown>;
}

export interface WorkspaceProject {
  id: number;
  workspaceId: WorkspaceId;
  name: string;
  summary: string | undefined;
  status: WorkspaceProjectStatus;
  taskCount: number;
  percentCompleted: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
}

export interface WorkspaceProjectDetail extends WorkspaceProject {
  instructions: string;
  reviewRequired: boolean;
  lockTimeoutHours: number;
  taskBoundaryType: string;
  hasAoi: boolean;
}

export interface WorkspaceProjectTaskListItem {
  id: string;
  label: string;
  status: WorkspaceProjectTaskStatus;
  geometry?: Polygon;
  taskNumber: number;
  mapperName: string;
  updatedAt: string;
  lock: WorkspaceProjectTaskApiLock | null;
  locked: boolean;
}

export interface WorkspaceProjectTaskDetail extends WorkspaceProjectTaskListItem {
  areaSquareKilometers: number;
  createdAt: Date;
  lastMapperName: string | null;
  updatedAtIso: string;
}

export interface WorkspaceProjectTaskSubmitFeedback {
  notes: string;
  reasonCategory?: WorkspaceProjectTaskFeedbackReasonCategory;
}

export interface WorkspaceProjectTaskSubmitPayload {
  osmChangesetId: number;
  done: boolean;
  feedback?: WorkspaceProjectTaskSubmitFeedback;
}

export interface WorkspaceProjectContributor {
  id: string;
  name: string;
  role: WorkspaceProjectContributorRole;
  updatedAt: Date;
}

export interface WorkspaceProjectContributionMetric {
  key: 'mapped' | 'validated' | 'completed';
  label: string;
  percent: number;
  color: string;
}

export interface WorkspaceProjectDetailSupplemental {
  descriptionHtml: string;
  instructionsHtml: string;
  tasks: WorkspaceProjectTaskListItem[];
  contributors: WorkspaceProjectContributor[];
  contributionMetrics: WorkspaceProjectContributionMetric[];
}

export interface WorkspaceProjectsPagination {
  page: number;
  pageSize: number;
  total: number;
}

export interface WorkspaceProjectsApiPagination {
  page: number;
  page_size: number;
  total: number;
}

export interface WorkspaceProjectsQuery {
  status?: WorkspaceProjectsQueryStatus;
  textSearch?: string;
  page: number;
  pageSize: number;
  orderBy: WorkspaceProjectsOrderBy;
  orderByType: WorkspaceProjectsOrderByType;
}

export interface WorkspaceProjectsResult {
  results: WorkspaceProject[];
  pagination: WorkspaceProjectsPagination;
}

export interface WorkspaceProjectsApiResponse {
  results: WorkspaceProjectApiItem[];
  pagination: WorkspaceProjectsApiPagination;
}
