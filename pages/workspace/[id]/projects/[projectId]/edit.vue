<template>
  <app-page fluid class="project-edit-page">
    <section class="project-edit-shell">
      <header class="project-edit-header">
        <nav class="project-edit-breadcrumbs" aria-label="Breadcrumb">
          <nuxt-link :to="projectsRoute">Workspaces</nuxt-link>
          <span aria-hidden="true">&gt;</span>
          <nuxt-link :to="projectsRoute">{{ workspace.title }}</nuxt-link>
          <span aria-hidden="true">&gt;</span>
          <nuxt-link :to="projectDetailRoute">{{ breadcrumbProjectName }}</nuxt-link>
        </nav>

        <h1 class="project-edit-title">
          Edit Project - {{ project.name }}
        </h1>
      </header>

      <div class="project-edit-body">
        <aside class="project-edit-sidebar">
          <nav class="project-edit-nav" aria-label="Edit project sections">
            <button
              v-for="section in sections"
              :key="section.id"
              class="project-edit-nav-item"
              :class="{ 'project-edit-nav-item-active': activeSection === section.id }"
              :aria-pressed="activeSection === section.id"
              type="button"
              @click="openSection(section.id)"
            >
              {{ section.label }}
            </button>
          </nav>

          <footer class="project-edit-sidebar-footer">
            <button
              class="btn btn-link project-edit-cancel"
              type="button"
              :disabled="saving"
              @click="handleCancel"
            >
              Cancel
            </button>

            <button
              class="btn project-edit-save"
              type="button"
              :disabled="!canSave"
              @click="handleSave"
            >
              <app-spinner v-if="saving" size="sm" />
              <template v-else>
                Save
              </template>
            </button>
          </footer>
        </aside>

        <section class="project-edit-content" aria-live="polite">
          <div class="project-edit-content-inner">
            <section v-if="activeSection === 'details'" class="project-edit-panel">
              <div class="project-edit-field">
                <label class="project-edit-label" for="project-edit-name">Project Name</label>
                <input
                  id="project-edit-name"
                  :value="form.name"
                  class="form-control project-edit-input-readonly"
                  type="text"
                  readonly
                >
                <p class="project-edit-help">
                  <app-icon variant="info" size="18" no-margin />
                  <span>Project name is preserved on save and cannot be edited here.</span>
                </p>
              </div>

              <div class="project-edit-divider" aria-hidden="true" />

              <div class="project-edit-field">
                <label class="project-edit-label" for="project-edit-description">Project Description</label>
                <textarea
                  id="project-edit-description"
                  v-model="form.description"
                  class="form-control project-edit-textarea"
                  rows="11"
                />
              </div>
            </section>

            <section v-else-if="activeSection === 'instructions'" class="project-edit-panel">
              <header class="project-edit-panel-header">
                <h2>Detailed Task Instructions</h2>
                <p>These instructions are shown to mappers and validators inside the task editor.</p>
              </header>

              <client-only fallback-tag="div">
                <project-wizard-rich-text-editor
                  :model-value="form.instructions"
                  @update:model-value="form.instructions = $event"
                />
              </client-only>
            </section>

            <section v-else-if="activeSection === 'team'" class="project-edit-panel">
              <header class="project-edit-panel-header">
                <h2>Team Members &amp; Assign Roles</h2>
                <p>Search workspace users, add them to this project, and change their role.</p>
              </header>

              <div class="project-edit-search-shell">
                <label class="visually-hidden" for="project-edit-member-search">Search users</label>
                <input
                  id="project-edit-member-search"
                  v-model.trim="memberSearchQuery"
                  class="form-control project-edit-search-input"
                  type="search"
                  placeholder="Search Users"
                >
                <app-icon variant="search" size="24" no-margin />
              </div>

              <div
                v-if="memberSearchLoading || memberSearchQuery.length > 0"
                class="project-edit-search-results"
              >
                <div v-if="memberSearchLoading" class="project-edit-search-status">
                  <app-spinner size="sm" />
                  <span>Searching users...</span>
                </div>

                <template v-else>
                  <article
                    v-for="user in memberSearchResults"
                    :key="user.authUid"
                    class="project-edit-search-result"
                  >
                    <div class="project-edit-member-person">
                      <span class="project-edit-avatar">
                        {{ getInitial(user.displayName) }}
                      </span>

                      <span class="project-edit-member-copy">
                        <strong>{{ user.displayName }}</strong>
                        <span>{{ user.email }}</span>
                      </span>
                    </div>

                    <div class="project-edit-search-result-actions">
                      <app-select
                        :id="`project-edit-search-role-${user.authUid}`"
                        :model-value="getSearchResultRole(user.authUid)"
                        :options="memberRoleOptions"
                        :aria-label="`Select role for ${user.displayName}`"
                        :disabled="mutatingMemberId === user.authUid"
                        @update:model-value="updateSearchResultRole(user.authUid, $event)"
                      />

                      <button
                        class="btn project-edit-search-add"
                        type="button"
                        :disabled="mutatingMemberId === user.authUid"
                        @click="addMember(user)"
                      >
                        <app-spinner v-if="mutatingMemberId === user.authUid" size="sm" />
                        <template v-else>
                          Add
                        </template>
                      </button>
                    </div>
                  </article>

                  <p v-if="memberSearchResults.length === 0" class="project-edit-search-status">
                    No users match your search.
                  </p>
                </template>
              </div>

              <div class="project-edit-members-list">
                <article
                  v-for="member in editableMembers"
                  :key="member.id"
                  class="project-edit-member-item"
                >
                  <div class="project-edit-member-person">
                    <span class="project-edit-avatar">
                      {{ getInitial(member.name) }}
                    </span>

                    <div class="project-edit-member-copy">
                      <strong>{{ member.name }}</strong>
                      <span>{{ member.email || member.id }}</span>
                    </div>
                  </div>

                  <div class="project-edit-member-actions">
                    <app-select
                      :id="`project-edit-member-role-${member.id}`"
                      :model-value="member.role"
                      :options="memberRoleOptions"
                      :aria-label="`Change role for ${member.name}`"
                      :disabled="isRoleChangeLocked(member) || mutatingMemberId === member.id"
                      @update:model-value="updateMemberRole(member, $event)"
                    />

                    <button
                      class="btn project-edit-member-remove"
                      type="button"
                      :disabled="isMemberRemovalLocked(member) || mutatingMemberId === member.id"
                      :aria-label="`Remove ${member.name}`"
                      @click="removeMember(member)"
                    >
                      <app-spinner v-if="mutatingMemberId === member.id" size="sm" />
                      <app-icon v-else variant="delete" size="18" no-margin />
                    </button>
                  </div>
                </article>

                <p v-if="editableMembers.length === 0" class="project-edit-empty">
                  No members are assigned to this project yet.
                </p>
              </div>
            </section>

            <section v-else-if="activeSection === 'configuration'" class="project-edit-panel">
              <div class="project-edit-settings-row">
                <div class="project-edit-settings-copy">
                  <h2>Lock Timeout</h2>
                  <p>Project will be locked for specific hours.</p>
                </div>

                <div class="project-edit-timeout-control">
                  <label class="visually-hidden" for="project-edit-lock-timeout">Lock timeout in hours</label>
                  <select
                    id="project-edit-lock-timeout"
                    v-model.number="form.lockTimeoutHours"
                    class="form-select"
                    :disabled="configurationLocked"
                  >
                    <option v-for="hourOption in hourOptions" :key="hourOption" :value="hourOption">
                      {{ String(hourOption).padStart(2, '0') }}
                    </option>
                  </select>
                  <span>hours</span>
                </div>
              </div>

              <div class="project-edit-divider" aria-hidden="true" />

              <div class="project-edit-settings-row">
                <div class="project-edit-settings-copy">
                  <h2>Review Required</h2>
                  <p>Enable to require a review before completion.</p>
                </div>

                <label class="project-edit-switch">
                  <input
                    v-model="form.reviewRequired"
                    class="project-edit-switch-input"
                    type="checkbox"
                    :disabled="configurationLocked"
                  >
                  <span class="project-edit-switch-track" />
                  <span class="visually-hidden">Toggle review requirement</span>
                </label>
              </div>

              <article v-if="configurationLocked" class="project-edit-message-card project-edit-message-card-warning">
                <div class="project-edit-message-icon">
                  <app-icon variant="gpp_bad" size="20" no-margin />
                </div>

                <div class="project-edit-message-copy">
                  <strong>Settings cannot be changed</strong>
                  <p>These settings are locked once tasks have been generated for the project.</p>
                </div>
              </article>
            </section>

            <section v-else class="project-edit-panel">
              <article
                v-for="action in actionCards"
                :key="action.id"
                class="project-edit-action-block"
              >
                <div class="project-edit-action-copy">
                  <h2>{{ action.title }}</h2>
                  <p>{{ action.description }}</p>
                </div>

                <button
                  class="btn project-edit-action-button"
                  :class="action.buttonClass"
                  type="button"
                  @click="openActionDialog(action)"
                >
                  <app-icon v-if="action.icon" :variant="action.icon" size="18" no-margin />
                  {{ action.label }}
                </button>

                <article class="project-edit-message-card project-edit-message-card-muted">
                  <div class="project-edit-message-icon">
                    <app-icon variant="info" size="20" no-margin />
                  </div>

                  <div class="project-edit-message-copy">
                    <strong>What this action does</strong>
                    <p>{{ action.helpText }}</p>
                  </div>
                </article>
              </article>
            </section>

            <p v-if="pageErrorMessage" class="project-edit-page-error" role="alert">
              {{ pageErrorMessage }}
            </p>
          </div>
        </section>
      </div>
    </section>

    <app-confirmation-dialog
      :visible="Boolean(actionDialog)"
      :title="actionDialog?.title ?? ''"
      :message="actionDialog?.message ?? ''"
      :primary-action-label="actionDialog?.primaryActionLabel ?? ''"
      :primary-variant="actionDialog?.primaryVariant ?? 'primary'"
      :busy="actionDialogBusy"
      @close="closeActionDialog"
      @primary-action="handleActionDialogPrimaryAction"
      @secondary-action="closeActionDialog"
    />
  </app-page>
</template>

<script setup lang="ts">
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import { listProjectGroupUsers } from '~/services/project-wizard-users';
import { workspaceProjectsClient, workspacesClient } from '~/services/index';

import type { ProjectWizardWorkspaceUser } from '~/types/project-wizard';
import type {
  WorkspaceProjectContributor,
  WorkspaceProjectContributorRole,
  WorkspaceProjectDetail,
} from '~/types/projects';

type ProjectEditSectionId =
  | 'details'
  | 'instructions'
  | 'team'
  | 'configuration'
  | 'actions';

interface ProjectEditSection {
  id: ProjectEditSectionId;
  label: string;
}

interface EditableProjectMember {
  email: string;
  id: string;
  name: string;
  role: WorkspaceProjectContributorRole;
}

interface ActionCard {
  buttonClass: string;
  confirmationMessage: string;
  confirmationPrimaryLabel: string;
  confirmationTitle: string;
  confirmationVariant: 'danger' | 'primary';
  description: string;
  helpText: string;
  icon?: string;
  id: string;
  label: string;
  title: string;
}

interface ActionDialogState {
  actionId: ActionCard['id'];
  message: string;
  primaryActionLabel: string;
  primaryVariant: 'danger' | 'primary';
  title: string;
}

const { create } = useModal();
const route = useRoute();
const workspaceId = Number(route.params.id);
const projectId = String(route.params.projectId);
const projectsRoute = `/workspace/${workspaceId}/projects`;
const projectDetailRoute = `/workspace/${workspaceId}/projects/${projectId}`;
const editRoute = `${projectDetailRoute}/edit`;
const MEMBER_SEARCH_DEBOUNCE_MS = 250;

const sections: ProjectEditSection[] = [
  { id: 'details', label: 'Project details' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'team', label: 'Team Members' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'actions', label: 'Actions' },
];

const memberRoleOptions: Array<{ label: string; value: WorkspaceProjectContributorRole }> = [
  { label: 'Lead', value: 'lead' },
  { label: 'Validator', value: 'validator' },
  { label: 'Contributor', value: 'contributor' },
];

const actionCards: ActionCard[] = [
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

const hourOptions = Array.from({ length: 24 }, (_, index) => index + 1);
const workspace = await workspacesClient.getWorkspace(workspaceId);
const project = ref(await loadProjectDetail());
const projectContributors = ref<WorkspaceProjectContributor[]>(await loadProjectContributors());
const knownUsers = ref<ProjectWizardWorkspaceUser[]>([]);
const memberSearchDebounce = ref<ReturnType<typeof setTimeout> | null>(null);
const memberSearchLoading = ref(false);
const memberSearchQuery = ref('');
const memberSearchRequestId = ref(0);
const memberSearchResults = ref<ProjectWizardWorkspaceUser[]>([]);
const searchResultRoles = ref<Record<string, WorkspaceProjectContributorRole>>({});
const mutatingMemberId = ref<string | null>(null);
const actionDialog = ref<ActionDialogState | null>(null);
const actionDialogBusy = ref(false);
const saving = ref(false);
const pageErrorMessage = ref('');
const editableMembers = ref<EditableProjectMember[]>([]);
const form = reactive({
  description: resolveInitialProjectDescription(),
  instructions: project.value.instructions,
  lockTimeoutHours: project.value.lockTimeoutHours,
  name: project.value.name,
  reviewRequired: project.value.reviewRequired,
});

const currentUserIdForRole = workspaceProjectsClient.auth.subject || null;
const {
  isProjectLead,
  promise: rolePromise,
} = useProjectRole(
  workspaceId,
  projectId,
  currentUserIdForRole,
  workspace.role,
);
await rolePromise;

if (!isProjectLead.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Only project leads can edit this project.',
  });
}

initializeEditableMembers();
useHead({
  title: computed(() => `Edit ${project.value.name} | Projects`),
});

const activeSection = computed<ProjectEditSectionId>(() => {
  const section = route.query.section;

  if (typeof section === 'string' && sections.some(item => item.id === section)) {
    return section as ProjectEditSectionId;
  }

  return 'details';
});

const breadcrumbProjectName = computed(() =>
  project.value.name.length > 24 ? `${project.value.name.slice(0, 24)}...` : project.value.name,
);

const configurationLocked = computed(() =>
  project.value.taskCount > 0 || project.value.status !== 'draft',
);

const selectedMemberIds = computed(() =>
  new Set(editableMembers.value.map(member => member.id)),
);

const leadMemberCount = computed(() =>
  editableMembers.value.filter(member => member.role === 'lead').length,
);

const canSave = computed(() =>
  !saving.value
  && saveableDirty.value
  && leadMemberCount.value > 0,
);

const isDirty = computed(() =>
  saveableDirty.value
  || descriptionDirty.value,
);

const saveableDirty = computed(() =>
  instructionsDirty.value
  || configurationDirty.value,
);

const instructionsDirty = computed(() =>
  normalizeRichText(form.instructions) !== normalizeRichText(project.value.instructions),
);

const descriptionDirty = computed(() =>
  form.description.trim() !== resolveInitialProjectDescription(),
);

const configurationDirty = computed(() =>
  !configurationLocked.value
  && (
    form.lockTimeoutHours !== project.value.lockTimeoutHours
    || form.reviewRequired !== project.value.reviewRequired
  ),
);

watch(memberSearchQuery, (query) => {
  if (memberSearchDebounce.value) {
    clearTimeout(memberSearchDebounce.value);
  }

  if (!query.trim()) {
    memberSearchRequestId.value += 1;
    memberSearchResults.value = [];
    memberSearchLoading.value = false;
    return;
  }

  memberSearchLoading.value = true;
  const requestId = ++memberSearchRequestId.value;
  memberSearchDebounce.value = setTimeout(() => {
    void searchUsers(query, requestId);
  }, MEMBER_SEARCH_DEBOUNCE_MS);
});

onMounted(() => {
  void preloadKnownUsers();
});

onBeforeUnmount(() => {
  if (memberSearchDebounce.value) {
    clearTimeout(memberSearchDebounce.value);
  }
});

async function preloadKnownUsers() {
  try {
    const users = await listProjectGroupUsers(
      workspace.tdeiProjectGroupId,
      'contributor',
    );
    mergeKnownUsers(users);
  }
  catch {
    // Existing contributor names are still sufficient for this screen.
  }
}

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
      ? {
          ...member,
          email: matchedUser.email,
          name: matchedUser.displayName,
        }
      : member;
  });
}

async function searchUsers(query: string, requestId: number) {
  try {
    const users = await listProjectGroupUsers(
      workspace.tdeiProjectGroupId,
      'contributor',
      query.trim(),
    );

    if (requestId !== memberSearchRequestId.value) {
      return;
    }

    mergeKnownUsers(users);
    memberSearchResults.value = users.filter(user => !selectedMemberIds.value.has(user.authUid));
  }
  catch {
    if (requestId !== memberSearchRequestId.value) {
      return;
    }

    memberSearchResults.value = [];
  }
  finally {
    if (requestId === memberSearchRequestId.value) {
      memberSearchLoading.value = false;
    }
  }
}

async function openSection(sectionId: ProjectEditSectionId) {
  await navigateTo({
    path: editRoute,
    query: { section: sectionId },
  });
}

function openActionDialog(action: ActionCard) {
  actionDialog.value = {
    actionId: action.id,
    message: action.confirmationMessage,
    primaryActionLabel: action.confirmationPrimaryLabel,
    primaryVariant: action.confirmationVariant,
    title: action.confirmationTitle,
  };
}

function closeActionDialog() {
  if (actionDialogBusy.value) {
    return;
  }

  actionDialog.value = null;
}

async function handleActionDialogPrimaryAction() {
  const dialog = actionDialog.value;

  if (!dialog) {
    return;
  }

  actionDialogBusy.value = true;

  try {
    if (dialog.actionId === 'close') {
      project.value = await workspaceProjectsClient.closeWorkspaceProject(workspaceId, projectId);
      actionDialog.value = null;
      toast.success('Project closed');
      await navigateTo(projectDetailRoute);
      return;
    }

    if (dialog.actionId === 'reset') {
      await workspaceProjectsClient.resetWorkspaceProject(workspaceId, projectId);
      actionDialog.value = null;
      toast.success('Project tasks reset');
      await navigateTo({
        path: projectDetailRoute,
        query: { tab: 'tasks' },
      });
      return;
    }

    await workspaceProjectsClient.deleteWorkspaceProject(workspaceId, projectId);
    actionDialog.value = null;
    toast.success('Project deleted');
    await navigateTo(projectsRoute);
  }
  catch (error) {
    toast.error(await resolveProjectActionErrorMessage(
      error,
      dialog.actionId === 'close'
        ? 'Failed to close project'
        : dialog.actionId === 'reset'
          ? 'Failed to reset project tasks'
          : 'Failed to delete project',
    ));
  }
  finally {
    actionDialogBusy.value = false;
  }
}

async function addMember(user: ProjectWizardWorkspaceUser) {
  if (selectedMemberIds.value.has(user.authUid)) {
    return;
  }

  const role = getSearchResultRole(user.authUid);

  mutatingMemberId.value = user.authUid;

  try {
    await workspaceProjectsClient.addWorkspaceProjectRole(
      workspaceId,
      projectId,
      {
        role,
        userId: user.authUid,
      },
    );
    await refreshProjectContributors();
    memberSearchQuery.value = '';
    memberSearchResults.value = [];
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Failed to add contributor');
  }
  finally {
    mutatingMemberId.value = null;
  }
}

function getSearchResultRole(userId: string): WorkspaceProjectContributorRole {
  return searchResultRoles.value[userId] ?? 'contributor';
}

function updateSearchResultRole(userId: string, nextRole: string | number | null) {
  if (!isWorkspaceProjectContributorRole(nextRole)) {
    return;
  }

  searchResultRoles.value = {
    ...searchResultRoles.value,
    [userId]: nextRole,
  };
}

async function updateMemberRole(member: EditableProjectMember, nextRole: string | number | null) {
  if (!isWorkspaceProjectContributorRole(nextRole)) {
    return;
  }

  if (member.role === nextRole) {
    return;
  }

  if (member.role === 'lead' && nextRole !== 'lead' && leadMemberCount.value <= 1) {
    toast.error('At least one lead must remain on the project.');
    return;
  }

  const previousMembers = editableMembers.value;

  editableMembers.value = editableMembers.value.map((candidate) => {
    if (candidate.id !== member.id) {
      return candidate;
    }

    return {
      ...candidate,
      role: nextRole,
    };
  });

  mutatingMemberId.value = member.id;

  try {
    await workspaceProjectsClient.updateWorkspaceProjectRole(
      workspaceId,
      projectId,
      member.id,
      nextRole,
    );
    await refreshProjectContributors();
  }
  catch (error) {
    editableMembers.value = previousMembers;
    toast.error(error instanceof Error ? error.message : 'Failed to update contributor role');
  }
  finally {
    mutatingMemberId.value = null;
  }
}

async function removeMember(member: EditableProjectMember) {
  if (member.role === 'lead' && leadMemberCount.value <= 1) {
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

  if (!value?.ok) {
    return;
  }

  mutatingMemberId.value = member.id;

  try {
    await workspaceProjectsClient.deleteWorkspaceProjectRole(
      workspaceId,
      projectId,
      member.id,
    );
    await refreshProjectContributors();
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Failed to remove contributor');
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

async function handleCancel() {
  if (!isDirty.value) {
    await navigateTo(projectDetailRoute);
    return;
  }

  const value = await create({
    title: 'Discard changes',
    body: 'Leave this page and discard unsaved project edits?',
    okTitle: 'Discard',
    okVariant: 'danger',
    cancelTitle: 'Continue Editing',
    cancelClass: 'btn-link p-0',
    cancelVariant: null,
  }).show();

  if (value?.ok) {
    await navigateTo(projectDetailRoute);
  }
}

async function handleSave() {
  if (!canSave.value) {
    return;
  }

  saving.value = true;
  pageErrorMessage.value = '';

  try {
    if (instructionsDirty.value || configurationDirty.value) {
      project.value = await workspaceProjectsClient.updateWorkspaceProject(
        workspaceId,
        projectId,
        {
          instructions: form.instructions,
          lockTimeoutHours: form.lockTimeoutHours,
          name: project.value.name,
          reviewRequired: form.reviewRequired,
        },
      );
    }

    toast.success('Project updated');
    await navigateTo(projectDetailRoute);
  }
  catch (error) {
    pageErrorMessage.value = error instanceof Error
      ? error.message
      : 'Project changes could not be saved.';
  }
  finally {
    saving.value = false;
  }
}

async function loadProjectDetail(): Promise<WorkspaceProjectDetail> {
  try {
    return await workspaceProjectsClient.getWorkspaceProjectDetail(workspaceId, projectId);
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load project details',
      data: error,
    });
  }
}

async function loadProjectContributors(): Promise<WorkspaceProjectContributor[]> {
  try {
    return await workspaceProjectsClient.getWorkspaceProjectRoles(workspaceId, projectId);
  }
  catch {
    return [];
  }
}

async function refreshProjectContributors() {
  projectContributors.value = await workspaceProjectsClient.getWorkspaceProjectRoles(workspaceId, projectId);
  initializeEditableMembers();
}

async function resolveProjectActionErrorMessage(error: unknown, fallbackMessage: string) {
  if (!(error instanceof Error) || !('response' in error)) {
    return fallbackMessage;
  }

  const response = (error as { response?: Response }).response;

  if (!response) {
    return fallbackMessage;
  }

  try {
    const body = await response.clone().json() as {
      detail?: Array<{ msg?: string }> | string;
    };

    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail;
    }

    if (Array.isArray(body.detail) && body.detail[0]?.msg) {
      return body.detail[0].msg;
    }
  }
  catch {
    // Fall back to the generic message when the API does not return a parseable JSON body.
  }

  return error.message || fallbackMessage;
}

function resolveInitialProjectDescription() {
  return project.value.summary?.trim() || '';
}

function normalizeRichText(value: string) {
  return value.trim();
}

function isWorkspaceProjectContributorRole(value: unknown): value is WorkspaceProjectContributorRole {
  return ['lead', 'validator', 'contributor'].includes(String(value));
}

function getInitial(value: string) {
  return value.trim().charAt(0).toUpperCase() || '?';
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-edit-page {
  height: calc(100vh - #{$navbar-height});
  padding-top: 1rem !important;
  padding-bottom: 1rem !important;
  overflow: hidden;
}

.project-edit-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 1rem;
  overflow: hidden;
}

.project-edit-header {
  padding: 2rem 2.25rem 1.9rem;
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.project-edit-breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-bottom: 1.2rem;
  color: #757d98;
  font-size: 1rem;
}

.project-edit-breadcrumbs a {
  color: inherit;
  text-decoration: none;
}

.project-edit-title {
  margin: 0;
  color: #1a1e3d;
  font-family: var(--secondary-font-family);
  font-size: clamp(1.8rem, 2.4vw, 2.35rem);
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.project-edit-body {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(15rem, 25%) minmax(0, 1fr);
}

.project-edit-sidebar {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba($text-navy, 0.08);
  background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);
}

.project-edit-nav {
  flex: 1;
  padding: 2rem 1.35rem 1.25rem;
  display: grid;
  align-content: start;
  gap: 0.8rem;
}

.project-edit-nav-item {
  min-height: 4.5rem;
  padding: 0.85rem 1.55rem;
  color: #29314f;
  font-size: 1.05rem;
  font-weight: 500;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 1rem;
}

.project-edit-nav-item-active {
  font-weight: 700;
  background: #f2f4fe;
}

.project-edit-sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem 2rem 1.6rem;
  border-top: 1px solid rgba($text-navy, 0.08);
}

.project-edit-cancel {
  padding: 0;
  color: #505977;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
}

.project-edit-save {
  min-width: 5.75rem;
  min-height: 3.2rem;
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 700;
  background: #4d158d;
  border: 1px solid #4d158d;
  border-radius: 0.45rem;
}

.project-edit-save:hover:not(:disabled),
.project-edit-save:focus-visible:not(:disabled) {
  color: #ffffff;
  background: #421178;
  border-color: #421178;
}

.project-edit-save:disabled {
  opacity: 0.6;
}

.project-edit-content {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.project-edit-content-inner {
  max-width: 55rem;
  padding: 2.2rem 3rem 3rem;
}

.project-edit-panel {
  display: grid;
  gap: 1.75rem;
}

.project-edit-panel-header {
  display: grid;
  gap: 0.35rem;
}

.project-edit-panel-header h2,
.project-edit-settings-copy h2,
.project-edit-action-copy h2 {
  margin: 0;
  color: #273156;
  font-size: 1.2rem;
  font-weight: 700;
}

.project-edit-panel-header p,
.project-edit-settings-copy p,
.project-edit-action-copy p {
  margin: 0;
  color: #6d7494;
  font-size: 0.98rem;
  line-height: 1.55;
}

.project-edit-field {
  display: grid;
  gap: 0.75rem;
}

.project-edit-label {
  color: #273156;
  font-size: 1.1rem;
  font-weight: 700;
}

.project-edit-input-readonly,
.project-edit-textarea-readonly {
  color: #7b829e;
  background: #fbfbfd;
}

.project-edit-textarea {
  min-height: 13rem;
  resize: vertical;
}

.project-edit-help {
  margin: 0;
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 0.45rem;
  color: #657091;
  font-size: 0.97rem;
}

.project-edit-help :deep(.material-icons) {
  margin-top: 0;
  flex: 0 0 auto;
}

.project-edit-help span {
  min-width: 0;
}

.project-edit-help-block {
  align-items: flex-start;
}

.project-edit-divider {
  border-top: 1px dashed rgba($text-navy, 0.18);
}

.project-edit-search-shell {
  position: relative;
}

.project-edit-search-shell :deep(.material-icons) {
  position: absolute;
  top: 50%;
  right: 1rem;
  color: #858cab;
  transform: translateY(-50%);
}

.project-edit-search-input {
  min-height: 3rem;
  padding-right: 3rem;
}

.project-edit-search-result-actions :deep(.tdei-select-toggle),
.project-edit-member-actions :deep(.tdei-select-toggle) {
  min-height: 3rem;
  border-radius: 0.8rem;
}

.project-edit-search-result-actions :deep(.tdei-select-menu),
.project-edit-member-actions :deep(.tdei-select-menu) {
  margin-top: 0.45rem;
  border-radius: 0.9rem;
  box-shadow: 0 1rem 2.5rem rgba($text-navy, 0.15);
}

.project-edit-search-result-actions :deep(.tdei-select-open),
.project-edit-member-actions :deep(.tdei-select-open) {
  z-index: 5;
}

.project-edit-search-results,
.project-edit-members-list {
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 1rem;
  background: #ffffff;
}

.project-edit-search-results {
  overflow: hidden;
}

.project-edit-members-list {
  overflow: visible;
}

.project-edit-search-result,
.project-edit-member-item {
  width: 100%;
  display: grid;
  align-items: center;
  gap: 0.9rem;
  padding: 1.15rem 1.35rem;
  background: #ffffff;
}

.project-edit-search-result {
  grid-template-columns: minmax(0, 1fr) auto;
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.project-edit-member-item {
  grid-template-columns: minmax(0, 1fr) auto;
  position: relative;
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.project-edit-search-result:last-child,
.project-edit-member-item:last-child {
  border-bottom: 0;
}

.project-edit-search-result:hover,
.project-edit-search-result:focus-visible {
  background: rgba($primary, 0.04);
}

.project-edit-search-result-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: flex-end;
}

.project-edit-search-result-actions :deep(.tdei-select) {
  min-width: 11rem;
  max-width: 12.5rem;
  flex: 1 1 auto;
}

.project-edit-search-status,
.project-edit-empty {
  margin: 0;
  padding: 1rem 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: #66708f;
  font-size: 0.95rem;
}

.project-edit-member-person,
.project-edit-member-actions {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.project-edit-member-actions {
  justify-content: flex-end;
}

.project-edit-member-copy {
  min-width: 0;
  display: grid;
  gap: 0.15rem;
}

.project-edit-member-copy strong {
  color: #273156;
  font-size: 1rem;
  font-weight: 700;
}

.project-edit-member-copy span {
  color: #6d7494;
  font-size: 0.95rem;
  line-height: 1.35;
  word-break: break-word;
}

.project-edit-avatar {
  width: 3rem;
  height: 3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #5a5574;
  font-size: 1.5rem;
  background: linear-gradient(180deg, #f3dbfe, #e3d9ff);
  border: 1px solid #dbc8f1;
  border-radius: 999px;
  flex: 0 0 auto;
}

.project-edit-search-add {
  min-width: 5.25rem;
  min-height: 3rem;
  color: #4d158d;
  font-size: 0.95rem;
  font-weight: 700;
  background: rgba($primary, 0.08);
  border: 1px solid rgba($primary, 0.18);
  border-radius: 0.8rem;
}

.project-edit-search-add:hover,
.project-edit-search-add:focus-visible {
  color: #421178;
  background: rgba($primary, 0.12);
  border-color: rgba($primary, 0.26);
}

.project-edit-member-remove {
  min-width: 2.9rem;
  min-height: 2.85rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #e14646;
  background: #ffffff;
  border: 1px solid rgba(225, 70, 70, 0.24);
  border-radius: 0.65rem;
}

.project-edit-member-remove:hover:not(:disabled),
.project-edit-member-remove:focus-visible:not(:disabled) {
  color: #cb3434;
  border-color: rgba(225, 70, 70, 0.34);
}

.project-edit-member-remove:disabled {
  opacity: 0.5;
}

.project-edit-settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.project-edit-timeout-control {
  display: inline-flex;
  align-items: stretch;
}

.project-edit-timeout-control .form-select {
  min-width: 5rem;
  border-radius: 0.55rem 0 0 0.55rem;
}

.project-edit-timeout-control span {
  min-width: 4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #8a91ab;
  font-size: 0.95rem;
  background: #f6f7fb;
  border: 1px solid rgba($text-navy, 0.12);
  border-left: 0;
  border-radius: 0 0.55rem 0.55rem 0;
}

.project-edit-switch {
  position: relative;
  width: 3.7rem;
  height: 2rem;
  display: inline-flex;
  flex: 0 0 auto;
}

.project-edit-switch-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.project-edit-switch-track {
  position: relative;
  width: 100%;
  height: 100%;
  background: rgba($secondary, 0.18);
  border-radius: 999px;
  transition: background-color 0.18s ease;
}

.project-edit-switch-track::after {
  content: "";
  position: absolute;
  top: 0.17rem;
  left: 0.18rem;
  width: 1.65rem;
  height: 1.65rem;
  background: #ffffff;
  border-radius: 999px;
  box-shadow: 0 0.15rem 0.5rem rgba($text-navy, 0.14);
  transition: transform 0.18s ease;
}

.project-edit-switch-input:checked + .project-edit-switch-track {
  background: rgba($primary, 0.8);
}

.project-edit-switch-input:checked + .project-edit-switch-track::after {
  transform: translateX(1.65rem);
}

.project-edit-switch-input:disabled + .project-edit-switch-track {
  opacity: 0.55;
}

.project-edit-message-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.9rem;
  padding: 1.35rem 1.45rem;
  border: 1px solid rgba($text-navy, 0.08);
  border-radius: 1rem;
}

.project-edit-message-card-muted {
  background: #ffffff;
}

.project-edit-message-card-warning {
  background: linear-gradient(180deg, #fffefe, #fff9f8);
}

.project-edit-message-icon {
  width: 3rem;
  height: 3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #dc4d4d;
  background: rgba(247, 118, 118, 0.1);
  border-radius: 999px;
}

.project-edit-message-icon-muted {
  color: #4d158d;
  background: rgba($primary, 0.1);
}

.project-edit-message-copy {
  display: grid;
  gap: 0.2rem;
}

.project-edit-message-copy strong {
  color: #273156;
  font-size: 1rem;
  font-weight: 700;
}

.project-edit-message-copy p {
  margin: 0;
  color: #657091;
  font-size: 0.98rem;
  line-height: 1.5;
}

.project-edit-unavailable-copy {
  color: #8a91ab !important;
}

.project-edit-action-block {
  display: grid;
  gap: 1.2rem;
  padding-bottom: 2rem;
  border-bottom: 1px dashed rgba($text-navy, 0.18);
}

.project-edit-action-block:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.project-edit-action-button {
  width: fit-content;
  min-height: 3.3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding-inline: 1.3rem;
  font-size: 1rem;
  font-weight: 700;
  opacity: 1;
}

.project-edit-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.project-edit-page-error {
  margin: 0;
  color: #c7393a;
  font-size: 0.96rem;
  font-weight: 600;
}

.project-edit-content :deep(.project-wizard-rich-text-editor) {
  background: #ffffff;
}

.project-edit-content :deep(.project-wizard-rich-text-editor-content .project-wizard-rich-text-editor-surface) {
  min-height: 31rem;
}

.project-edit-content :deep(.tdei-select-toggle) {
  min-width: 8rem;
  min-height: 2.9rem;
  border-radius: 0.65rem;
}

@include media-breakpoint-down(lg) {
  .project-edit-body {
    grid-template-columns: minmax(13rem, 18rem) minmax(0, 1fr);
  }

  .project-edit-content-inner {
    padding-left: 2rem;
    padding-right: 2rem;
  }
}

@include media-breakpoint-down(md) {
  .project-edit-page {
    height: auto;
    overflow: visible;
  }

  .project-edit-shell {
    height: auto;
  }

  .project-edit-body {
    grid-template-columns: 1fr;
  }

  .project-edit-sidebar {
    border-right: 0;
    border-bottom: 1px solid rgba($text-navy, 0.08);
  }

  .project-edit-nav {
    padding-bottom: 1rem;
  }

  .project-edit-nav-item {
    min-height: 3.65rem;
  }

  .project-edit-sidebar-footer {
    padding-top: 1rem;
  }

  .project-edit-content {
    overflow: visible;
  }

  .project-edit-content-inner {
    max-width: none;
    padding: 1.5rem;
  }

  .project-edit-settings-row {
    align-items: stretch;
    flex-direction: column;
  }

  .project-edit-search-result {
    grid-template-columns: 1fr;
  }

  .project-edit-search-result-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .project-edit-timeout-control {
    width: 100%;
    justify-content: flex-start;
  }

  .project-edit-timeout-control .form-select {
    min-width: 0;
  }

  .project-edit-member-item {
    grid-template-columns: 1fr;
  }

  .project-edit-member-item {
    display: grid;
  }

  .project-edit-member-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

@include media-breakpoint-down(sm) {
  .project-edit-header {
    padding: 1.5rem 1rem;
  }

  .project-edit-title {
    font-size: 1.8rem;
  }

  .project-edit-nav,
  .project-edit-sidebar-footer,
  .project-edit-content-inner {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .project-edit-sidebar-footer {
    padding-bottom: 1rem;
  }

  .project-edit-member-person,
  .project-edit-member-actions,
  .project-edit-action-button {
    width: 100%;
  }

  .project-edit-action-button {
    justify-content: center;
  }
}
</style>
