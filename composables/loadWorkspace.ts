import { workspacesClient } from '~/services/index';
import { WorkspacesClientError } from '~/services/workspaces';

import type { WorkspacesClient } from '~/services/workspaces';
import type { Workspace } from '~/types/workspaces';

/**
 * Loads the workspace a page is about, for a page that cannot render without
 * it. When the user has no such workspace, this throws a fatal 404, so Nuxt
 * shows "Workspace not found" (error.vue) rather than the page failing on the
 * missing workspace and reporting a 500.
 *
 * The API answers 404 both for a workspace that does not exist and for one in
 * a project group the user is not in, so the message covers both. An id that
 * is not a workspace id at all (`/workspace/abc/...`) is not found either.
 */
export async function loadWorkspace(
  workspaceId: number,
  client: WorkspacesClient = workspacesClient
): Promise<Workspace> {
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    throw workspaceNotFoundError();
  }

  try {
    return await client.getWorkspace(workspaceId);
  }
  catch (error: unknown) {
    if (error instanceof WorkspacesClientError && error.response.status === 404) {
      throw workspaceNotFoundError();
    }

    throw error;
  }
}

function workspaceNotFoundError() {
  return createError({
    status: 404,
    statusText: 'Workspace not found',
    message: 'This workspace does not exist or you do not have permission to access it.',
    fatal: true
  });
}
