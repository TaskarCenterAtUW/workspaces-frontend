import type { WorkspaceId } from '~/types/workspaces';

export type WorkspaceProjectStatus = 'draft' | 'in_progress' | 'completed';
export type WorkspaceProjectView = 'grid' | 'list';
export type WorkspaceProjectSort = 'latest' | 'oldest' | 'name_asc' | 'name_desc';
export type WorkspaceProjectsApiStatus = 'draft' | 'open' | 'completed';
export type WorkspaceProjectsQueryStatus = WorkspaceProjectsApiStatus;
export type WorkspaceProjectsOrderBy = 'createdAt' | 'name';
export type WorkspaceProjectsOrderByType = 'ASC' | 'DESC';

export interface WorkspaceProjectApiItem {
  id: number;
  name: string;
  status: WorkspaceProjectsApiStatus;
  taskCount: number;
  percentCompleted: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
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
  pagination: WorkspaceProjectsPagination;
}
