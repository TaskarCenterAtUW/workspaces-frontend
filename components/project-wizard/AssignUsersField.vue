<template>
  <section class="project-wizard-assign-users">
    <div class="project-wizard-assign-users-search-shell">
      <label
        class="visually-hidden"
        :for="searchInputId"
      >Search users</label>
      <input
        :id="searchInputId"
        :value="searchQuery"
        class="form-control project-wizard-assign-users-search-input"
        type="search"
        placeholder="Search Users"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      >
      <app-icon
        variant="search"
        size="22"
        no-margin
      />
    </div>

    <div
      v-if="loading || shouldShowSearchResults || error"
      class="project-wizard-assign-users-results"
    >
      <div
        v-if="loading"
        class="project-wizard-assign-users-status"
      >
        <app-spinner size="sm" />
        <span>Loading users...</span>
      </div>

      <div v-else-if="error" class="project-wizard-assign-users-status">
        <span>{{ error }}</span>
        <button class="btn btn-link" type="button" @click="emit('retry')">
          Retry
        </button>
      </div>

      <template v-else>
        <button
          v-for="user in visibleSearchResults"
          :key="user.authUid"
          class="project-wizard-assign-users-result"
          type="button"
          @click="emit('add:user', user)"
        >
          <span class="project-wizard-assign-users-avatar">
            <app-icon
              variant="person"
              size="18"
              no-margin
            />
          </span>

          <span class="project-wizard-assign-users-copy">
            <strong>{{ user.displayName }}</strong>
            <span>{{ user.email }}</span>
          </span>

          <span class="project-wizard-assign-users-role-pill">
            {{ formatRole(user.role) }}
          </span>
        </button>

        <p
          v-if="visibleSearchResults.length === 0"
          class="project-wizard-assign-users-status"
        >
          No users match your search.
        </p>
      </template>
    </div>

    <div class="project-wizard-assign-users-selected">
      <div
        v-for="user in selectedUsers"
        :key="user.authUid"
        class="project-wizard-assign-users-selected-item"
      >
        <span class="project-wizard-assign-users-avatar">
          <app-icon
            variant="person"
            size="18"
            no-margin
          />
        </span>

        <span class="project-wizard-assign-users-copy">
          <strong>{{ user.displayName }}</strong>
          <span>{{ user.email }}</span>
        </span>

        <span class="project-wizard-assign-users-role-pill">
          {{ formatRole(user.role) }}
        </span>

        <button
          class="btn btn-link project-wizard-assign-users-remove"
          type="button"
          :aria-label="`Remove ${user.displayName}`"
          @click="emit('remove:user', user.authUid)"
        >
          <app-icon
            variant="delete"
            size="20"
            no-margin
          />
        </button>
      </div>

      <p
        v-if="selectedUsers.length === 0"
        class="project-wizard-assign-users-status"
      >
        Search and add users for this project.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ProjectWizardWorkspaceUser } from '~/types/project-wizard';
import type { WorkspaceRole } from '~/types/workspaces';

interface Props {
  error?: string | null;
  loading: boolean;
  searchQuery: string;
  searchResults: ProjectWizardWorkspaceUser[];
  selectedUsers: ProjectWizardWorkspaceUser[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'add:user': [user: ProjectWizardWorkspaceUser];
  'remove:user': [userId: string];
  'retry': [];
  'update:search': [value: string];
}>();

const searchInputId = 'project-wizard-assign-users-search';
const visibleSearchResults = computed(() => props.searchResults.slice(0, 5));
const shouldShowSearchResults = computed(() => props.searchQuery.trim().length > 0);

function formatRole(role: WorkspaceRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-assign-users {
  display: grid;
  gap: 0.85rem;
}

.project-wizard-assign-users-search-shell {
  position: relative;
}

.project-wizard-assign-users-search-shell :deep(.material-icons) {
  position: absolute;
  top: 50%;
  right: 0.9rem;
  color: rgba($secondary, 0.8);
  transform: translateY(-50%);
}

.project-wizard-assign-users-search-input {
  padding-right: 2.75rem;
}

.project-wizard-assign-users-results,
.project-wizard-assign-users-selected {
  border: 1px solid rgba($text-navy, 0.12);
  border-radius: 0.45rem;
  background-color: #fff;
  overflow: hidden;
}

.project-wizard-assign-users-result,
.project-wizard-assign-users-selected-item {
  width: 100%;
  display: grid;
  align-items: center;
  gap: 0.8rem;
  padding: 0.85rem 1rem;
  background-color: #fff;
}

.project-wizard-assign-users-result {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.project-wizard-assign-users-selected-item {
  grid-template-columns: auto minmax(0, 1fr) auto auto;
}

.project-wizard-assign-users-result {
  border: 0;
  border-bottom: 1px solid rgba($text-navy, 0.08);
  text-align: left;
}

.project-wizard-assign-users-selected-item {
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.project-wizard-assign-users-result:last-child,
.project-wizard-assign-users-selected-item:last-child {
  border-bottom: 0;
}

.project-wizard-assign-users-result:hover,
.project-wizard-assign-users-result:focus-visible {
  background-color: rgba($primary, 0.04);
}

.project-wizard-assign-users-avatar {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba($secondary, 0.9);
  background-color: rgba($primary, 0.04);
  border: 1px solid rgba($primary, 0.08);
  border-radius: 999px;
  flex: 0 0 auto;
}

.project-wizard-assign-users-copy {
  min-width: 0;
  display: grid;
  gap: 0.15rem;
}

.project-wizard-assign-users-copy strong {
  color: $text-navy;
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.25;
}

.project-wizard-assign-users-copy span {
  color: rgba($secondary, 0.94);
  font-size: 0.88rem;
  line-height: 1.35;
  word-break: break-word;
}

.project-wizard-assign-users-role-pill {
  justify-self: start;
  padding: 0.22rem 0.55rem;
  color: rgba($secondary, 0.96);
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
  background-color: rgba($primary, 0.06);
  border: 1px solid rgba($primary, 0.12);
  border-radius: 999px;
}

.project-wizard-assign-users-remove {
  color: $danger-red;
  text-decoration: none;
}

.project-wizard-assign-users-remove:hover,
.project-wizard-assign-users-remove:focus-visible {
  color: $danger-red;
  text-decoration: none;
}

.project-wizard-assign-users-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.9rem 1rem;
  margin: 0;
  color: rgba($secondary, 0.96);
  font-size: 0.92rem;
}

@include media-breakpoint-down(sm) {
  .project-wizard-assign-users-result,
  .project-wizard-assign-users-selected-item {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .project-wizard-assign-users-role-pill,
  .project-wizard-assign-users-remove {
    grid-column: 2;
  }

  .project-wizard-assign-users-remove {
    justify-self: end;
  }
}
</style>
