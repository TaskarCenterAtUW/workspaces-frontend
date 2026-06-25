<template>
  <b-modal
    ref="modal"
    hide-footer
    title="Add Contributor"
    @hidden="resetForm"
  >
    <section class="project-detail-add-contributor">
      <p class="project-detail-add-contributor-copy">
        Select a workspace user and assign their project role.
      </p>

      <div class="project-detail-add-contributor-field">
        <label :for="searchInputId" class="form-label">Search users</label>
        <div class="project-detail-add-contributor-search-shell">
          <input
            :id="searchInputId"
            :value="searchQuery"
            class="form-control project-detail-add-contributor-search-input"
            type="search"
            placeholder="Search by name or email"
            @input="onSearchInput"
          >
          <app-icon variant="search" size="20" no-margin />
        </div>
      </div>

      <div class="project-detail-add-contributor-results" aria-live="polite">
        <div v-if="loading" class="project-detail-add-contributor-status">
          <app-spinner size="sm" />
          <span>Loading users...</span>
        </div>

        <p v-else-if="filteredUsers.length === 0" class="project-detail-add-contributor-status">
          No users match your search.
        </p>

        <div v-else class="project-detail-add-contributor-list" role="listbox" aria-label="Available users">
          <button
            v-for="user in filteredUsers"
            :key="user.authUid"
            class="project-detail-add-contributor-user"
            :class="{
              'project-detail-add-contributor-user-disabled': isExistingUser(user.authUid),
              'project-detail-add-contributor-user-selected': selectedUserId === user.authUid,
            }"
            type="button"
            :disabled="isExistingUser(user.authUid)"
            :aria-pressed="selectedUserId === user.authUid"
            @click="selectUser(user.authUid)"
          >
            <span class="project-detail-add-contributor-avatar" aria-hidden="true">
              {{ getInitial(user.displayName) }}
            </span>

            <span class="project-detail-add-contributor-user-copy">
              <strong>{{ user.displayName }}</strong>
              <span>{{ user.email }}</span>
            </span>

            <span
              v-if="isExistingUser(user.authUid)"
              class="project-detail-add-contributor-state"
            >
              Already added
            </span>
          </button>
        </div>
      </div>

      <div class="project-detail-add-contributor-field">
        <label :for="roleSelectId" class="form-label">Role</label>
        <app-select
          :id="roleSelectId"
          v-model="selectedRole"
          :options="roleOptions"
          :aria-label="'Select contributor role'"
        />
      </div>

      <div class="project-detail-add-contributor-actions">
        <button
          class="btn btn-outline-secondary"
          type="button"
          :disabled="saving"
          @click="hide"
        >
          Cancel
        </button>

        <button
          class="btn btn-primary"
          type="button"
          :disabled="!canSubmit || saving"
          @click="submit"
        >
          <app-spinner v-if="saving" size="sm" />
          <template v-else>
            Add Contributor
          </template>
        </button>
      </div>
    </section>
  </b-modal>
</template>

<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import type { ComponentExposed } from 'vue-component-type-helpers';

import type { ProjectWizardWorkspaceUser } from '~/types/project-wizard';
import type { WorkspaceProjectContributorRole } from '~/types/projects';

interface SelectOption {
  label: string;
  value: WorkspaceProjectContributorRole;
}

interface Props {
  existingUserIds: string[];
  loading: boolean;
  saving: boolean;
  users: ProjectWizardWorkspaceUser[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  submit: [payload: { role: WorkspaceProjectContributorRole; userId: string }];
  'update:search': [value: string];
}>();

const modal = useTemplateRef<ComponentExposed<typeof BModal>>('modal');
const searchInputId = 'project-detail-add-contributor-search';
const roleSelectId = 'project-detail-add-contributor-role';
const searchQuery = ref('');
const selectedRole = ref<WorkspaceProjectContributorRole>('contributor');
const selectedUserId = ref('');

const roleOptions: SelectOption[] = [
  { label: 'Lead', value: 'lead' },
  { label: 'Validator', value: 'validator' },
  { label: 'Contributor', value: 'contributor' },
];

const filteredUsers = computed(() => props.users.slice(0, 10));

const canSubmit = computed(() =>
  selectedUserId.value.trim().length > 0,
);

defineExpose({ hide, show });

function show() {
  modal.value?.show();
}

function hide() {
  modal.value?.hide();
}

function resetForm() {
  searchQuery.value = '';
  selectedRole.value = 'contributor';
  selectedUserId.value = '';
  emit('update:search', '');
}

function submit() {
  if (!canSubmit.value) {
    return;
  }

  emit('submit', {
    role: selectedRole.value,
    userId: selectedUserId.value,
  });
  hide();
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function onSearchInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  searchQuery.value = value;
  emit('update:search', value);
}

function isExistingUser(userId: string) {
  return props.existingUserIds.includes(userId);
}

function selectUser(userId: string) {
  if (isExistingUser(userId)) {
    return;
  }

  selectedUserId.value = userId;
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-detail-add-contributor {
  display: grid;
  gap: 1rem;
}

.project-detail-add-contributor-copy {
  margin: 0;
  color: rgba($secondary, 0.96);
  font-size: 0.96rem;
  line-height: 1.5;
}

.project-detail-add-contributor-field {
  display: grid;
  gap: 0.45rem;
}

.project-detail-add-contributor-search-shell {
  position: relative;
}

.project-detail-add-contributor-search-shell :deep(.material-icons) {
  position: absolute;
  top: 50%;
  right: 0.85rem;
  color: rgba($secondary, 0.78);
  transform: translateY(-50%);
}

.project-detail-add-contributor-search-input {
  padding-right: 2.5rem;
}

.project-detail-add-contributor-results {
  min-height: 8rem;
  border: 1px solid rgba($text-navy, 0.12);
  border-radius: 0.75rem;
  background: #ffffff;
  overflow: hidden;
}

.project-detail-add-contributor-list {
  max-height: 20rem;
  overflow-y: auto;
}

.project-detail-add-contributor-user {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
  padding: 0.9rem 1rem;
  text-align: left;
  background: #ffffff;
  border: 0;
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.project-detail-add-contributor-user:last-child {
  border-bottom: 0;
}

.project-detail-add-contributor-user:hover,
.project-detail-add-contributor-user:focus-visible {
  background: rgba($primary, 0.04);
}

.project-detail-add-contributor-user-disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.project-detail-add-contributor-user-disabled:hover,
.project-detail-add-contributor-user-disabled:focus-visible {
  background: #ffffff;
}

.project-detail-add-contributor-user-selected {
  background: rgba($primary, 0.08);
}

.project-detail-add-contributor-avatar {
  width: 2.25rem;
  height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #5d5abf;
  font-size: 0.95rem;
  font-weight: 700;
  background: linear-gradient(135deg, #efe7fb 0%, #edf1ff 100%);
  border: 1px solid rgba(#7150d0, 0.14);
  border-radius: 50%;
}

.project-detail-add-contributor-user-copy {
  min-width: 0;
  display: grid;
  gap: 0.15rem;
}

.project-detail-add-contributor-user-copy strong {
  color: $text-navy;
  font-size: 0.96rem;
  font-weight: 700;
  line-height: 1.25;
}

.project-detail-add-contributor-user-copy span {
  color: rgba($secondary, 0.94);
  font-size: 0.88rem;
  line-height: 1.35;
  word-break: break-word;
}

.project-detail-add-contributor-state {
  color: rgba($secondary, 0.88);
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.project-detail-add-contributor-status {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 1rem;
  margin: 0;
  color: rgba($secondary, 0.96);
  font-size: 0.92rem;
}

.project-detail-add-contributor-field :deep(.tdei-select-toggle) {
  min-height: 2.9rem;
  border-radius: 0.75rem;
}

.project-detail-add-contributor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.project-detail-add-contributor-actions .btn {
  min-width: 9.5rem;
  min-height: 2.9rem;
}

@include media-breakpoint-down(sm) {
  .project-detail-add-contributor-actions {
    grid-template-columns: 1fr;
    display: grid;
  }

  .project-detail-add-contributor-actions .btn {
    width: 100%;
  }
}
</style>
