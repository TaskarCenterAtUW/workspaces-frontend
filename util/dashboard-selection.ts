import type { WorkspaceId } from '~/types/workspaces';

const STORAGE_KEY_PREFIX = 'tdei-dashboard-selection';

export interface DashboardSelection {
  projectGroupId: string | null;
  workspaceByProjectGroup: Record<string, WorkspaceId>;
}

/** Returns an empty dashboard selection state. */
function emptySelection(): DashboardSelection {
  return { projectGroupId: null, workspaceByProjectGroup: {} };
}

/** Checks whether a value is a positive integer workspace ID. */
function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Returns the user-scoped storage key for dashboard selection state. */
export function getDashboardSelectionStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

/** Reads the saved dashboard selection for a user, or returns an empty selection on failure. */
export function readDashboardSelection(storage: Storage, userId: string): DashboardSelection {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(getDashboardSelectionStorageKey(userId)) ?? 'null'
    );
    if (!value || typeof value !== 'object') {
      return emptySelection();
    }

    const { projectGroupId, workspaceByProjectGroup } = value as Partial<Record<keyof DashboardSelection, unknown>>;
    const workspaces: Record<string, WorkspaceId> = {};
    if (workspaceByProjectGroup && typeof workspaceByProjectGroup === 'object') {
      for (const [groupId, workspaceId] of Object.entries(workspaceByProjectGroup)) {
        if (isWorkspaceId(workspaceId)) {
          workspaces[groupId] = workspaceId;
        }
      }
    }

    return {
      projectGroupId: typeof projectGroupId === 'string' && projectGroupId ? projectGroupId : null,
      workspaceByProjectGroup: workspaces,
    };
  }
  catch {
    return emptySelection();
  }
}

/** Persists the dashboard selection for a user when storage is available. */
export function writeDashboardSelection(
  storage: Storage,
  userId: string,
  selection: DashboardSelection
): void {
  try {
    storage.setItem(getDashboardSelectionStorageKey(userId), JSON.stringify(selection));
  }
  catch {
    // Persistence is optional when storage is unavailable or full.
  }
}

/** Returns the remembered project group if still accessible, otherwise the first available group. */
export function resolveProjectGroupId(
  rememberedId: string | null | undefined,
  availableIds: string[]
): string | null {
  if (rememberedId && availableIds.includes(rememberedId)) {
    return rememberedId;
  }
  return availableIds[0] ?? null;
}
