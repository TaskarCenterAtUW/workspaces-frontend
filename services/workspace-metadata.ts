import { workspacesClient } from '~/services/index';

import type { Workspace, WorkspaceId } from '~/types/workspaces';

// `GET /workspaces/mine` leaves out each workspace's `tdeiMetadata`: for a
// workspace made from a TDEI dataset it holds the whole dataset record, area
// polygon included, which made the list large. The dashboard fetches it for
// the selected workspace only, through `GET /workspaces/{id}`. Cached per
// workspace so the map and the information panel share one request.
const cache = new Map<WorkspaceId, Promise<Workspace['tdeiMetadata']>>();

export function loadWorkspaceMetadata(id: WorkspaceId): Promise<Workspace['tdeiMetadata']> {
  let metadata = cache.get(id);

  if (!metadata) {
    metadata = workspacesClient.getWorkspace(id).then(
      workspace => workspace.tdeiMetadata,
      (error: unknown) => {
        // Let the next selection retry rather than caching the failure.
        cache.delete(id);
        throw error;
      }
    );
    cache.set(id, metadata);
  }

  return metadata;
}

// Drops cached metadata so it is fetched again, e.g. when the dashboard loads
// or refreshes, since an export can change a workspace's metadata.
export function clearWorkspaceMetadata(): void {
  cache.clear();
}
