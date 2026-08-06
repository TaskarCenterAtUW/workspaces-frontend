import type { WorkspaceProjectTaskListItem } from '~/types/projects';

type TaskValidationIdentity = Pick<
  WorkspaceProjectTaskListItem,
  'lastMapperId' | 'status'
>;

export function isTaskSelfValidation(
  task: TaskValidationIdentity,
  currentUserId: string | null,
): boolean {
  return task.status === 'ready_for_validation'
    && currentUserId !== null
    && task.lastMapperId === currentUserId;
}
