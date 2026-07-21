import { workspaceProjectsClient, workspacesClient } from '~/services/index';

import type { WorkspaceId } from '~/types/workspaces';

export interface DashboardWorkspaceSummary {
  memberCount: number | null;
  projectCount: number | null;
}

const EMPTY_SUMMARY: DashboardWorkspaceSummary = {
  memberCount: null,
  projectCount: null,
};

export function useDashboardWorkspaceSummary() {
  const summaries = reactive(new Map<WorkspaceId, DashboardWorkspaceSummary>());
  const loadingWorkspaceId = ref<WorkspaceId | null>(null);
  const error = ref<string | null>(null);
  let abortController: AbortController | null = null;

  function getSummary(workspaceId: WorkspaceId): DashboardWorkspaceSummary {
    return summaries.get(workspaceId) ?? EMPTY_SUMMARY;
  }

  async function loadSummary(workspaceId: WorkspaceId): Promise<void> {
    abortController?.abort();

    if (summaries.has(workspaceId)) {
      loadingWorkspaceId.value = null;
      error.value = null;
      return;
    }

    abortController = new AbortController();
    const signal = abortController.signal;

    loadingWorkspaceId.value = workspaceId;
    error.value = null;

    const projectsClient = workspaceProjectsClient.clone(signal);
    const workspaceClient = workspacesClient.clone(signal);
    const [projectsResult, membersResult] = await Promise.allSettled([
      projectsClient.getWorkspaceProjects(workspaceId, {
        page: 1,
        pageSize: 1,
        orderBy: 'created_at',
        orderByType: 'DESC',
      }),
      workspaceClient.getWorkspaceMembers(workspaceId),
    ]);

    if (signal.aborted) {
      return;
    }

    const summary: DashboardWorkspaceSummary = {
      projectCount: projectsResult.status === 'fulfilled'
        ? projectsResult.value.pagination.total
        : null,
      memberCount: membersResult.status === 'fulfilled'
        ? membersResult.value.length
        : null,
    };

    summaries.set(workspaceId, summary);

    if (projectsResult.status === 'rejected' || membersResult.status === 'rejected') {
      error.value = 'Some workspace totals could not be loaded.';
    }

    loadingWorkspaceId.value = null;
  }

  onBeforeUnmount(() => abortController?.abort());

  return {
    error: readonly(error),
    getSummary,
    loadSummary,
    loadingWorkspaceId: readonly(loadingWorkspaceId),
  };
}
