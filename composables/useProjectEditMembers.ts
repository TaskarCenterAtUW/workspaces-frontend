import { toast } from 'vue3-toastify';

import { resolveHttpErrorMessage } from '~/services/http';
import { workspaceProjectsClient } from '~/services/index';
import { listProjectGroupUsers } from '~/services/project-wizard-users';

import type { ProjectWizardWorkspaceUser } from '~/types/project-wizard';
import type { WorkspaceProjectContributor, WorkspaceProjectContributorRole } from '~/types/projects';

export interface EditableProjectMember {
  email: string;
  id: string;
  name: string;
  role: WorkspaceProjectContributorRole;
}

const MEMBER_SEARCH_DEBOUNCE_MS = 250;

export const PROJECT_MEMBER_ROLE_OPTIONS: Array<{
  label: string;
  value: WorkspaceProjectContributorRole;
}> = [
  { label: 'Lead', value: 'lead' },
  { label: 'Validator', value: 'validator' },
  { label: 'Contributor', value: 'contributor' },
];

export function useProjectEditMembers(options: {
  initialContributors: WorkspaceProjectContributor[];
  projectGroupId: string;
  projectId: string;
  workspaceId: number;
}) {
  const { create } = useModal();
  const projectContributors = ref(options.initialContributors);
  const knownUsers = ref<ProjectWizardWorkspaceUser[]>([]);
  const memberSearchLoading = ref(false);
  const memberSearchQuery = ref('');
  const memberSearchResults = ref<ProjectWizardWorkspaceUser[]>([]);
  const searchResultRoles = ref<Record<string, WorkspaceProjectContributorRole>>({});
  const mutatingMemberId = ref<string | null>(null);
  const editableMembers = ref<EditableProjectMember[]>([]);
  let memberSearchDebounce: ReturnType<typeof setTimeout> | undefined;
  let memberSearchRequestId = 0;

  const selectedMemberIds = computed(() =>
    new Set(editableMembers.value.map(member => member.id)),
  );
  const leadMemberCount = computed(() =>
    editableMembers.value.filter(member => member.role === 'lead').length,
  );

  initializeEditableMembers();

  watch(memberSearchQuery, (query) => {
    if (memberSearchDebounce) {
      clearTimeout(memberSearchDebounce);
    }

    if (!query.trim()) {
      memberSearchRequestId += 1;
      memberSearchResults.value = [];
      memberSearchLoading.value = false;
      return;
    }

    memberSearchLoading.value = true;
    const requestId = ++memberSearchRequestId;
    memberSearchDebounce = setTimeout(() => {
      void searchUsers(query, requestId);
    }, MEMBER_SEARCH_DEBOUNCE_MS);
  });

  onMounted(() => void preloadKnownUsers());
  onBeforeUnmount(() => {
    if (memberSearchDebounce) {
      clearTimeout(memberSearchDebounce);
    }
    memberSearchRequestId += 1;
  });

  function initializeEditableMembers() {
    editableMembers.value = projectContributors.value.map((contributor) => {
      const matchedUser = knownUsers.value.find(user => user.authUid === contributor.id);
      return {
        email: matchedUser?.email ?? '',
        id: contributor.id,
        name: matchedUser?.displayName ?? contributor.name,
        role: contributor.role,
      };
    });
  }

  function mergeKnownUsers(users: ProjectWizardWorkspaceUser[]) {
    const mergedUsers = new Map(knownUsers.value.map(user => [user.authUid, user]));
    for (const user of users) {
      mergedUsers.set(user.authUid, user);
    }

    knownUsers.value = [...mergedUsers.values()];
    editableMembers.value = editableMembers.value.map((member) => {
      const matchedUser = mergedUsers.get(member.id);
      return matchedUser
        ? { ...member, email: matchedUser.email, name: matchedUser.displayName }
        : member;
    });
  }

  async function preloadKnownUsers() {
    try {
      mergeKnownUsers(await listProjectGroupUsers(options.projectGroupId, 'contributor'));
    }
    catch {
      // Contributor data returned by the project API remains usable without enrichment.
    }
  }

  async function searchUsers(query: string, requestId: number) {
    try {
      const users = await listProjectGroupUsers(options.projectGroupId, 'contributor', query.trim());
      if (requestId !== memberSearchRequestId) return;
      mergeKnownUsers(users);
      memberSearchResults.value = users.filter(user => !selectedMemberIds.value.has(user.authUid));
    }
    catch {
      if (requestId === memberSearchRequestId) memberSearchResults.value = [];
    }
    finally {
      if (requestId === memberSearchRequestId) memberSearchLoading.value = false;
    }
  }

  async function refreshProjectContributors() {
    projectContributors.value = await workspaceProjectsClient.getWorkspaceProjectRoles(
      options.workspaceId,
      options.projectId,
    );
    initializeEditableMembers();
  }

  function getSearchResultRole(userId: string): WorkspaceProjectContributorRole {
    return searchResultRoles.value[userId] ?? 'contributor';
  }

  function updateSearchResultRole(userId: string, nextRole: string | number | null) {
    if (!isProjectContributorRole(nextRole)) return;
    searchResultRoles.value = { ...searchResultRoles.value, [userId]: nextRole };
  }

  async function addMember(user: ProjectWizardWorkspaceUser) {
    if (selectedMemberIds.value.has(user.authUid)) return;
    mutatingMemberId.value = user.authUid;
    try {
      await workspaceProjectsClient.addWorkspaceProjectRole(options.workspaceId, options.projectId, {
        role: getSearchResultRole(user.authUid),
        userId: user.authUid,
      });
      await refreshProjectContributors();
      memberSearchQuery.value = '';
      memberSearchResults.value = [];
    }
    catch (error) {
      toast.error(await resolveHttpErrorMessage(error, 'Failed to add contributor'));
    }
    finally {
      mutatingMemberId.value = null;
    }
  }

  async function updateMemberRole(member: EditableProjectMember, nextRole: string | number | null) {
    if (!isProjectContributorRole(nextRole) || member.role === nextRole) return;
    if (member.role === 'lead' && nextRole !== 'lead' && leadMemberCount.value <= 1) {
      toast.error('At least one lead must remain on the project.');
      return;
    }

    const previousMembers = editableMembers.value;
    editableMembers.value = editableMembers.value.map(candidate =>
      candidate.id === member.id ? { ...candidate, role: nextRole } : candidate,
    );
    mutatingMemberId.value = member.id;
    try {
      await workspaceProjectsClient.updateWorkspaceProjectRole(
        options.workspaceId,
        options.projectId,
        member.id,
        nextRole,
      );
      await refreshProjectContributors();
    }
    catch (error) {
      editableMembers.value = previousMembers;
      toast.error(await resolveHttpErrorMessage(error, 'Failed to update contributor role'));
    }
    finally {
      mutatingMemberId.value = null;
    }
  }

  async function removeMember(member: EditableProjectMember) {
    if (isMemberRemovalLocked(member)) {
      toast.error('At least one lead must remain on the project.');
      return;
    }

    const value = await create({
      title: 'Remove Contributor',
      body: `Remove ${member.name} from this project?`,
      okTitle: 'Remove',
      okVariant: 'danger',
      cancelTitle: 'Cancel',
      cancelClass: 'btn-link p-0',
      cancelVariant: null,
    }).show();
    if (!value?.ok) return;

    mutatingMemberId.value = member.id;
    try {
      await workspaceProjectsClient.deleteWorkspaceProjectRole(
        options.workspaceId,
        options.projectId,
        member.id,
      );
      await refreshProjectContributors();
    }
    catch (error) {
      toast.error(await resolveHttpErrorMessage(error, 'Failed to remove contributor'));
    }
    finally {
      mutatingMemberId.value = null;
    }
  }

  function isRoleChangeLocked(member: EditableProjectMember) {
    return member.role === 'lead' && leadMemberCount.value <= 1;
  }

  function isMemberRemovalLocked(member: EditableProjectMember) {
    return member.role === 'lead' && leadMemberCount.value <= 1;
  }

  return {
    addMember,
    editableMembers,
    getSearchResultRole,
    isMemberRemovalLocked,
    isRoleChangeLocked,
    leadMemberCount,
    memberRoleOptions: PROJECT_MEMBER_ROLE_OPTIONS,
    memberSearchLoading,
    memberSearchQuery,
    memberSearchResults,
    mutatingMemberId,
    removeMember,
    updateMemberRole,
    updateSearchResultRole,
  };
}

function isProjectContributorRole(value: unknown): value is WorkspaceProjectContributorRole {
  return value === 'lead' || value === 'validator' || value === 'contributor';
}
