import { listProjectGroupUsers } from '~/services/project-wizard-users';

import type { Ref } from 'vue';
import type {
  ProjectWizardDraft,
  ProjectWizardWorkspaceUser,
  ProjectWizardStepId,
} from '~/types/project-wizard';
import type { WorkspaceRole } from '~/types/workspaces';
import { resolveHttpErrorMessage } from '~/services/http';

interface UseProjectWizardSettingsOptions {
  currentStep: Ref<ProjectWizardStepId>;
  draft: ProjectWizardDraft;
  projectGroupId: string;
}

const PROJECT_WIZARD_VALIDATOR_ROLE: WorkspaceRole = 'validator';

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
            role: PROJECT_WIZARD_VALIDATOR_ROLE,
          } satisfies ProjectWizardWorkspaceUser;
        }

        return {
          id: -1,
          authUid: assignment.userId,
          displayName: assignment.displayName || assignment.userId,
          email: assignment.email,
          role: PROJECT_WIZARD_VALIDATOR_ROLE,
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

  const workspaceUsersError = ref<string | null>(null);

  async function ensureWorkspaceUsersLoaded() {
    if (workspaceUsersLoaded.value || workspaceUsersLoading.value) {
      return;
    }

    workspaceUsersError.value = null;
    workspaceUsersLoading.value = true;

    try {
      workspaceUsers.value = await listProjectGroupUsers(
        options.projectGroupId,
        PROJECT_WIZARD_VALIDATOR_ROLE,
      );
      options.draft.settings.roleAssignments = options.draft.settings.roleAssignments.map((assignment) => {
        const matchedUser = workspaceUsers.value.find(user => user.authUid === assignment.userId);

        return matchedUser
          ? {
              ...assignment,
              displayName: matchedUser.displayName,
              email: matchedUser.email,
              role: PROJECT_WIZARD_VALIDATOR_ROLE,
            }
          : assignment;
      });
      workspaceUsersLoaded.value = true;
    }
    catch(error){
      workspaceUsersError.value = await resolveHttpErrorMessage(error,'Failed to load workspace users.');
    }
    finally {
      workspaceUsersLoading.value = false;
    }
  }

  function retryLoadWorkspaceUsers() {
    void ensureWorkspaceUsersLoaded();
  }

  function addValidator(user: ProjectWizardWorkspaceUser) {
    if (selectedValidatorIds.value.has(user.authUid)) {
      return;
    }

    options.draft.settings.roleAssignments.push({
      displayName: user.displayName,
      email: user.email,
      userId: user.authUid,
      role: PROJECT_WIZARD_VALIDATOR_ROLE,
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
    retryLoadWorkspaceUsers,
    selectedValidators,
    updateInstructions,
    updateLockTimeoutHours,
    updateReviewRequired,
    updateValidatorSearchQuery,
    validatorSearchQuery,
    workspaceUsersError,
    workspaceUsersLoading,
  };
}
