import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useProjectRole,
  useWorkspaceProjectPermissions,
} from '~/composables/useProjectRole';

const getWorkspaceProjectUserRole = vi.hoisted(() => vi.fn());

vi.mock('~/services/index', () => ({
  workspaceProjectsClient: {
    getWorkspaceProjectUserRole,
  },
}));

describe('useWorkspaceProjectPermissions', () => {
  it('allows workspace leads and project-group POCs to create projects', () => {
    expect(useWorkspaceProjectPermissions('lead', []).canCreateProject.value).toBe(true);
    expect(useWorkspaceProjectPermissions('contributor', ['poc']).canCreateProject.value).toBe(true);
    expect(useWorkspaceProjectPermissions('contributor', []).canCreateProject.value).toBe(false);
  });
});

describe('useProjectRole', () => {
  beforeEach(() => {
    getWorkspaceProjectUserRole.mockReset();
  });

  it('uses the explicit project role to grant validation access', async () => {
    getWorkspaceProjectUserRole.mockResolvedValue('validator');
    const role = useProjectRole(1763, '39', 'user-1', 'contributor');

    await role.promise;

    expect(role.effectiveRole.value).toBe('validator');
    expect(role.canValidate.value).toBe(true);
    expect(role.canMap.value).toBe(true);
    expect(role.roleLoadError.value).toBeNull();
  });

  it('keeps workspace lead precedence without making a redundant role request', async () => {
    const role = useProjectRole(1763, '39', 'lead-1', 'lead');

    await role.promise;

    expect(getWorkspaceProjectUserRole).not.toHaveBeenCalled();
    expect(role.effectiveRole.value).toBe('lead');
    expect(role.canManageContributors.value).toBe(true);
  });

  it('exposes project-role request failures instead of silently treating them as no role', async () => {
    const requestError = new Error('Role service unavailable');
    getWorkspaceProjectUserRole.mockRejectedValue(requestError);
    const role = useProjectRole(1763, '39', 'user-1', 'contributor');

    await role.promise;

    expect(role.roleLoadError.value).toBe(requestError);
    expect(role.canValidate.value).toBe(false);
  });
});
