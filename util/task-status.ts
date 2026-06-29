import type {
  WorkspaceProjectTaskListItem,
  WorkspaceProjectTaskStatus,
} from '~/types/projects';
import type { WorkspaceRole } from '~/types/workspaces';

export function formatWorkspaceProjectTaskStatus(status: WorkspaceProjectTaskStatus): string {
  switch (status) {
    case 'ready_for_validation':
      return 'Ready for validation';
    case 'needs_more_mapping':
      return 'More mapping needed';
    case 'completed':
      return 'Completed';
    case 'ready_for_mapping':
    default:
      return 'Ready for mapping';
  }
}

export function resolveWorkspaceProjectTaskStatusLabel(
  task: Pick<WorkspaceProjectTaskListItem, 'locked' | 'status'>,
  viewerRole?: WorkspaceRole | null,
): string {
  if (task.locked && task.status !== 'completed') {
    switch (task.status) {
      case 'ready_for_validation':
        return 'Validating';
      case 'ready_for_mapping':
      case 'needs_more_mapping':
        return 'Mapping';
      default:
        return viewerRole === 'lead' || viewerRole === 'validator'
          ? 'Validating'
          : 'Mapping';
    }
  }

  return formatWorkspaceProjectTaskStatus(task.status);
}
