import type { Workspace, WorkspaceRole } from '~/types/workspaces';

/**
 * Provides role-checking helpers for the current workspace. Requires a parent
 * component to call:
 *
 *   provide('workspace', workspace).
 *
 */
export function useWorkspaceRole() {
  const workspace = inject<Workspace>('workspace');

  if (import.meta.dev && !workspace) {
    console.warn(
      'useWorkspaceRole: no workspace injected.',
      'A parent component must call provide("workspace", workspace).',
    );
  }

  const role = computed<WorkspaceRole | undefined>(() => workspace?.role);
  const isLead = computed(() => role.value === 'lead');
  const isValidator = computed(() => role.value === 'validator' || isLead.value);

  return { role, isLead, isValidator };
}
