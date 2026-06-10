import page1Response from '~/mock-api/workspace-projects/page-1.json';
import page2Response from '~/mock-api/workspace-projects/page-2.json';
import page3Response from '~/mock-api/workspace-projects/page-3.json';

import type {
  WorkspaceProjectsApiResponse,
  WorkspaceProjectsOrderByType,
  WorkspaceProjectsQuery,
} from '~/types/projects';

const MOCK_WORKSPACE_PROJECT_RESPONSES: WorkspaceProjectsApiResponse[] = [
  page1Response,
  page2Response,
  page3Response,
];

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

    return compareDate(a.createdAt, b.createdAt, query.orderByType);
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
      pageSize: 10,
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
      pageSize: query.pageSize,
      total: sortedResults.length,
    },
  };
}
