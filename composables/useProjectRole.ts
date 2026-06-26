import { workspaceProjectsClient } from '~/services/index';
import type { WorkspaceProjectContributorRole } from '~/types/projects';
import type { WorkspaceRole } from '~/types/workspaces';

/**
 * Resolves the current user's effective role for a project.
 *
 * Effective role precedence:
 *   - workspace role = 'lead'  → effective = 'lead' (always wins)
 *   - otherwise               → project role if set, else workspace role
 *
 * Returns reactive computed flags for all permission checks needed across the project UI.
 */
export function useProjectRole(
  workspaceId: number,
  projectId: string,
  currentUserId: string | null,
  workspaceRole: WorkspaceRole | undefined,
) {
  // Fetch the user's explicit project-level role. Returns null if none is assigned (404).
  const projectRole = ref<WorkspaceProjectContributorRole | null>(null);

  /**
   * The effective role is the highest-privilege role the user holds.
   * Workspace lead always takes precedence over any project-level role.
   */
  const effectiveRole = computed<WorkspaceRole | WorkspaceProjectContributorRole | null>(() => {
    if (workspaceRole === 'lead') {
      return 'lead';
    }

    return projectRole.value ?? workspaceRole ?? null;
  });

  /** User has lead-level access on this project (workspace lead OR project lead). */
  const isProjectLead = computed(() => effectiveRole.value === 'lead');

  /** User is a workspace-level lead (stricter than isProjectLead). */
  const isWorkspaceLead = computed(() => workspaceRole === 'lead');

  /** User can validate tasks (validator or lead effective role). */
  const canValidate = computed(() =>
    effectiveRole.value === 'lead' || effectiveRole.value === 'validator',
  );

  /** User can map tasks (any recognised role). */
  const canMap = computed(() =>
    effectiveRole.value === 'lead'
    || effectiveRole.value === 'validator'
    || effectiveRole.value === 'contributor',
  );

  /**
   * User can add or update project contributor role assignments.
   * Requires workspace lead OR project lead.
   */
  const canManageContributors = computed(() =>
    workspaceRole === 'lead' || projectRole.value === 'lead',
  );

  const isExplicitProjectLead = computed(() => projectRole.value === 'lead');

  const promise = (async () => {
    if (currentUserId) {
      try {
        projectRole.value = await workspaceProjectsClient.getWorkspaceProjectUserRole(
          workspaceId,
          projectId,
          currentUserId,
        );
      }
      catch {
        projectRole.value = null;
      }
    }
  })();

  return {
    effectiveRole,
    isProjectLead,
    isWorkspaceLead,
    isExplicitProjectLead,
    canValidate,
    canMap,
    canManageContributors,
    promise,
  };
}
