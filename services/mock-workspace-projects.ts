import page1Response from '~/mock-api/workspace-projects/page-1.json';
import page2Response from '~/mock-api/workspace-projects/page-2.json';
import page3Response from '~/mock-api/workspace-projects/page-3.json';

import type {
  WorkspaceProjectsApiResponse,
  WorkspaceProjectsApiStatus,
  WorkspaceProjectsOrderByType,
  WorkspaceProjectsQuery,
} from '~/types/projects';

interface LegacyWorkspaceProjectApiItem {
  id: number;
  name: string;
  status: 'draft' | 'open' | 'completed';
  taskCount: number;
  percentCompleted: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface LegacyWorkspaceProjectsApiResponse {
  results: LegacyWorkspaceProjectApiItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

function normalizeMockStatus(status: LegacyWorkspaceProjectApiItem['status']): WorkspaceProjectsApiStatus {
  return status === 'completed' ? 'done' : status;
}

function normalizeMockResponse(response: LegacyWorkspaceProjectsApiResponse): WorkspaceProjectsApiResponse {
  return {
    results: response.results.map(project => ({
      id: project.id,
      name: project.name,
      status: normalizeMockStatus(project.status),
      task_count: project.taskCount,
      percent_completed: project.percentCompleted,
      created_by: project.createdBy,
      created_by_name: project.createdByName,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    })),
    pagination: {
      page: response.pagination.page,
      page_size: response.pagination.pageSize,
      total: response.pagination.total,
    },
  };
}

// JSON imports widen string-literal fields (e.g. `status`) to `string`, so the
// fixtures need an assertion to their declared shape. The mock data is authored
// to match LegacyWorkspaceProjectsApiResponse.
const LEGACY_MOCK_WORKSPACE_PROJECT_RESPONSES = [
  page1Response,
  page2Response,
  page3Response,
] as LegacyWorkspaceProjectsApiResponse[];

const MOCK_WORKSPACE_PROJECT_RESPONSES = LEGACY_MOCK_WORKSPACE_PROJECT_RESPONSES.map(normalizeMockResponse);

const MOCK_WORKSPACE_PROJECT_RESULTS = MOCK_WORKSPACE_PROJECT_RESPONSES.flatMap(response => response.results);

function compareText(a: string, b: string, orderByType: WorkspaceProjectsOrderByType) {
  const result = a.localeCompare(b);
  return orderByType === 'ASC' ? result : -result;
}

function compareDate(a: string, b: string, orderByType: WorkspaceProjectsOrderByType) {
  const result = new Date(a).getTime() - new Date(b).getTime();
  return orderByType === 'ASC' ? result : -result;
}

function sortMockProjects(response: WorkspaceProjectsApiResponse, query: WorkspaceProjectsQuery) {
  return [...response.results].sort((a, b) => {
    if (query.orderBy === 'name') {
      return compareText(a.name, b.name, query.orderByType);
    }

    return compareDate(a.created_at, b.created_at, query.orderByType);
  });
}

function filterMockProjects(response: WorkspaceProjectsApiResponse, query: WorkspaceProjectsQuery) {
  const normalizedSearch = query.textSearch?.trim().toLowerCase();

  return response.results.filter((project) => {
    const matchesStatus = !query.status || project.status === query.status;
    const matchesSearch = !normalizedSearch || project.name.toLowerCase().includes(normalizedSearch);

    return matchesStatus && matchesSearch;
  });
}

export function getMockWorkspaceProjectsResponse(query: WorkspaceProjectsQuery): WorkspaceProjectsApiResponse {
  const baseResponse: WorkspaceProjectsApiResponse = {
    results: MOCK_WORKSPACE_PROJECT_RESULTS,
    pagination: {
      page: 1,
      page_size: 10,
      total: MOCK_WORKSPACE_PROJECT_RESULTS.length,
    },
  };

  const filteredResults = filterMockProjects(baseResponse, query);
  const sortedResults = sortMockProjects({ ...baseResponse, results: filteredResults }, query);
  const start = (query.page - 1) * query.pageSize;
  const pagedResults = sortedResults.slice(start, start + query.pageSize);

  return {
    results: pagedResults,
    pagination: {
      page: query.page,
      page_size: query.pageSize,
      total: sortedResults.length,
    },
  };
}
