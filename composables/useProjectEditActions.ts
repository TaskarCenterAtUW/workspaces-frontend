import { toast } from 'vue3-toastify';

import { resolveHttpErrorMessage } from '~/services/http';
import { workspaceProjectsClient } from '~/services/index';

export type ProjectEditActionId = 'close' | 'delete' | 'reset';

export interface ProjectEditActionCard {
  buttonClass: string;
  confirmationMessage: string;
  confirmationPrimaryLabel: string;
  confirmationTitle: string;
  confirmationVariant: 'danger' | 'primary';
  description: string;
  helpText: string;
  icon?: string;
  id: ProjectEditActionId;
  label: string;
  title: string;
}

export interface ProjectEditActionDialogState {
  actionId: ProjectEditActionId;
  message: string;
  primaryActionLabel: string;
  primaryVariant: 'danger' | 'primary';
  title: string;
}

export const PROJECT_EDIT_ACTIONS: ProjectEditActionCard[] = [
  {
    id: 'reset',
    title: 'Reset All Tasks',
    description: 'Restore all mapping tasks to their original unassigned state.',
    label: 'Reset All Tasks',
    buttonClass: 'btn-outline-danger',
    confirmationTitle: 'Are you sure you want to reset?',
    confirmationMessage: 'All mapping tasks will be restored to their original unassigned state. This action is permanent and cannot be undone.',
    confirmationPrimaryLabel: 'Yes, Reset',
    confirmationVariant: 'danger',
    helpText: 'Removes all task assignments, resets task progress, and keeps project-level settings and team members.',
  },
  {
    id: 'close',
    title: 'Close Project',
    description: 'Closing this project will change its status to Completed.',
    label: 'Close Project',
    buttonClass: 'btn-primary',
    confirmationTitle: 'Close this project?',
    confirmationMessage: 'Closing this project will change its status to Completed. Make sure all tasks are completed before proceeding.',
    confirmationPrimaryLabel: 'Yes, Close',
    confirmationVariant: 'primary',
    helpText: 'This will mark the project as completed. Verify that all tasks have been completed before continuing.',
  },
  {
    id: 'delete',
    title: 'Delete Project',
    description: 'Permanently delete this project and all associated tasks and team members.',
    label: 'Delete Project',
    buttonClass: 'btn-danger',
    confirmationTitle: 'Are you sure you want to delete this project?',
    confirmationMessage: 'This will permanently delete the project, along with all associated tasks and team member assignments.',
    confirmationPrimaryLabel: 'Yes, Delete',
    confirmationVariant: 'danger',
    icon: 'delete',
    helpText: 'This would permanently delete the project and associated tasking data. This action cannot be undone.',
  },
];

export function useProjectEditActions(options: {
  projectDetailRoute: string;
  projectId: string;
  projectsRoute: string;
  workspaceId: number;
}) {
  const actionDialog = ref<ProjectEditActionDialogState | null>(null);
  const actionDialogBusy = ref(false);

  function openActionDialog(action: ProjectEditActionCard) {
    actionDialog.value = {
      actionId: action.id,
      message: action.confirmationMessage,
      primaryActionLabel: action.confirmationPrimaryLabel,
      primaryVariant: action.confirmationVariant,
      title: action.confirmationTitle,
    };
  }

  function closeActionDialog() {
    if (!actionDialogBusy.value) {
      actionDialog.value = null;
    }
  }

  async function handleActionDialogPrimaryAction() {
    const dialog = actionDialog.value;

    if (!dialog) {
      return;
    }

    actionDialogBusy.value = true;

    try {
      if (dialog.actionId === 'close') {
        await workspaceProjectsClient.closeWorkspaceProject(options.workspaceId, options.projectId);
        toast.success('Project closed');
        await navigateTo(options.projectDetailRoute);
      }
      else if (dialog.actionId === 'reset') {
        await workspaceProjectsClient.resetWorkspaceProject(options.workspaceId, options.projectId);
        toast.success('Project tasks reset');
        await navigateTo({ path: options.projectDetailRoute, query: { tab: 'tasks' } });
      }
      else {
        await workspaceProjectsClient.deleteWorkspaceProject(options.workspaceId, options.projectId);
        toast.success('Project deleted');
        await navigateTo(options.projectsRoute);
      }

      actionDialog.value = null;
    }
    catch (error) {
      const fallback = dialog.actionId === 'close'
        ? 'Failed to close project'
        : dialog.actionId === 'reset'
          ? 'Failed to reset project tasks'
          : 'Failed to delete project';
      toast.error(await resolveHttpErrorMessage(error, fallback));
    }
    finally {
      actionDialogBusy.value = false;
    }
  }

  return {
    actionCards: PROJECT_EDIT_ACTIONS,
    actionDialog,
    actionDialogBusy,
    closeActionDialog,
    handleActionDialogPrimaryAction,
    openActionDialog,
  };
}
