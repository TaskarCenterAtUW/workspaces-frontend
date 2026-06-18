import type { WorkspaceId } from '~/types/workspaces';

export type WorkspaceProjectStatus = 'draft' | 'in_progress' | 'completed';
export type WorkspaceProjectView = 'grid' | 'list';
export type WorkspaceProjectSort = 'latest' | 'oldest' | 'name_asc' | 'name_desc';
export type WorkspaceProjectsApiStatus = 'draft' | 'open' | 'done';
export type WorkspaceProjectsQueryStatus = WorkspaceProjectsApiStatus;
export type WorkspaceProjectsOrderBy = 'created_at' | 'name';
export type WorkspaceProjectsOrderByType = 'ASC' | 'DESC';

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
  createdByName: string;
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
