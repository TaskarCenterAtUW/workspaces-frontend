import { tdeiUserClient } from '~/services/index';

import type { ProjectWizardWorkspaceUser } from '~/types/project-wizard';
import type { TdeiUserItem } from '~/types/tdei';
import type { WorkspaceRole } from '~/types/workspaces';

const PROJECT_GROUP_USER_DEFAULT_ROLE: WorkspaceRole = 'contributor';

export function normalizeProjectGroupUser(
  user: TdeiUserItem,
  role: WorkspaceRole = PROJECT_GROUP_USER_DEFAULT_ROLE,
): ProjectWizardWorkspaceUser {
  const displayName = `${user.first_name} ${user.last_name}`.trim() || user.username || user.email;

  return {
    id: Number.NaN,
    authUid: user.user_id,
    displayName,
    email: user.email,
    role,
  };
}

export async function listProjectGroupUsers(
  projectGroupId: string,
  role: WorkspaceRole = PROJECT_GROUP_USER_DEFAULT_ROLE,
  searchText: string = '',
): Promise<ProjectWizardWorkspaceUser[]> {
  const items = await tdeiUserClient.getProjectGroupUsers(projectGroupId, searchText);
  return items.map(user => normalizeProjectGroupUser(user, role));
}
