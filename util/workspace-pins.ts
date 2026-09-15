import type { WorkspaceId } from '~/types/workspaces';

const STORAGE_KEY_PREFIX = 'tdei-pinned-workspaces';

export function getWorkspacePinsStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function readWorkspacePins(storage: Storage, userId: string): WorkspaceId[] {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(getWorkspacePinsStorageKey(userId)) ?? '[]'
    );

    if (!Array.isArray(value)) {
      return [];
    }

    return [...new Set(value.filter(
      (workspaceId): workspaceId is WorkspaceId =>
        typeof workspaceId === 'number' && Number.isInteger(workspaceId) && workspaceId > 0
    ))];
  }
  catch {
    return [];
  }
}

export function writeWorkspacePins(
  storage: Storage,
  userId: string,
  workspaceIds: Iterable<WorkspaceId>
): void {
  try {
    storage.setItem(
      getWorkspacePinsStorageKey(userId),
      JSON.stringify([...workspaceIds])
    );
  }
  catch {
    // Persistence is optional when storage is unavailable or full.
  }
}

export function removeUnavailableWorkspacePins(
  pinnedWorkspaceIds: Iterable<WorkspaceId>,
  availableWorkspaceIds: Iterable<WorkspaceId>
): WorkspaceId[] {
  const availableIds = new Set(availableWorkspaceIds);
  return [...pinnedWorkspaceIds].filter(workspaceId => availableIds.has(workspaceId));
}
