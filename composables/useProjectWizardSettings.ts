import { listProjectWizardWorkspaceUsers } from '~/services/project-wizard-users';

import type { Ref } from 'vue';
import type {
  ProjectWizardDraft,
  ProjectWizardWorkspaceUser,
  ProjectWizardStepId,
} from '~/types/project-wizard';
import type { WorkspaceId } from '~/types/workspaces';

interface UseProjectWizardSettingsOptions {
  currentStep: Ref<ProjectWizardStepId>;
  draft: ProjectWizardDraft;
  workspaceId: WorkspaceId;
}

export function useProjectWizardSettings(options: UseProjectWizardSettingsOptions) {
  const validatorSearchQuery = ref('');
  const workspaceUsers = ref<ProjectWizardWorkspaceUser[]>([]);
  const workspaceUsersLoading = ref(false);
  const workspaceUsersLoaded = ref(false);

  const isSettingsStepActive = computed(() => options.currentStep.value === 'settings');
  const selectedValidatorIds = computed(() =>
    new Set(options.draft.settings.roleAssignments.map(assignment => assignment.userId)),
  );

  const selectedValidators = computed(() =>
    options.draft.settings.roleAssignments
      .map((assignment) => {
        const matchedUser = workspaceUsers.value.find(user => user.authUid === assignment.userId);

        if (matchedUser) {
          return {
            ...matchedUser,
            role: assignment.role,
          } satisfies ProjectWizardWorkspaceUser;
        }

        return {
          id: -1,
          authUid: assignment.userId,
          displayName: assignment.displayName || assignment.userId,
          email: assignment.email,
          role: assignment.role,
        } satisfies ProjectWizardWorkspaceUser;
      }),
  );

  const filteredWorkspaceUsers = computed(() => {
    const normalizedQuery = validatorSearchQuery.value.trim().toLowerCase();

    return workspaceUsers.value.filter((user) => {
      if (selectedValidatorIds.value.has(user.authUid)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return user.displayName.toLowerCase().includes(normalizedQuery)
        || user.email.toLowerCase().includes(normalizedQuery);
    });
  });

  async function ensureWorkspaceUsersLoaded() {
    if (workspaceUsersLoaded.value || workspaceUsersLoading.value) {
      return;
    }

    workspaceUsersLoading.value = true;

    try {
      workspaceUsers.value = await listProjectWizardWorkspaceUsers(options.workspaceId);
      options.draft.settings.roleAssignments = options.draft.settings.roleAssignments.map((assignment) => {
        const matchedUser = workspaceUsers.value.find(user => user.authUid === assignment.userId);

        return matchedUser
          ? {
              ...assignment,
              displayName: matchedUser.displayName,
              email: matchedUser.email,
              role: matchedUser.role,
            }
          : assignment;
      });
      workspaceUsersLoaded.value = true;
    }
    finally {
      workspaceUsersLoading.value = false;
    }
  }

  function addValidator(user: ProjectWizardWorkspaceUser) {
    if (selectedValidatorIds.value.has(user.authUid)) {
      return;
    }

    options.draft.settings.roleAssignments.push({
      displayName: user.displayName,
      email: user.email,
      userId: user.authUid,
      role: user.role,
    });
    validatorSearchQuery.value = '';
  }

  function removeValidator(userId: string) {
    const assignmentIndex = options.draft.settings.roleAssignments
      .findIndex(assignment => assignment.userId === userId);

    if (assignmentIndex === -1) {
      return;
    }

    options.draft.settings.roleAssignments.splice(assignmentIndex, 1);
  }

  function updateInstructions(value: string) {
    options.draft.settings.instructions = value;
  }

  function updateLockTimeoutHours(value: number) {
    options.draft.settings.lockTimeoutHours = Number.isFinite(value)
      ? Math.max(1, Math.round(value))
      : 1;
  }

  function updateReviewRequired(value: boolean) {
    options.draft.settings.reviewRequired = value;
  }

  function updateValidatorSearchQuery(value: string) {
    validatorSearchQuery.value = value;
  }

  watch(
    isSettingsStepActive,
    (isActive) => {
      if (isActive) {
        void ensureWorkspaceUsersLoaded();
      }
    },
    { immediate: true },
  );

  return {
    addValidator,
    filteredWorkspaceUsers,
    isSettingsStepActive,
    removeValidator,
    selectedValidators,
    updateInstructions,
    updateLockTimeoutHours,
    updateReviewRequired,
    updateValidatorSearchQuery,
    validatorSearchQuery,
    workspaceUsersLoading,
  };
}
