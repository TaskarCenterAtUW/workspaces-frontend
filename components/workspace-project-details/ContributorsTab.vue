<template>
  <section class="project-detail-card project-detail-contributors-card">
    <header class="project-detail-contributors-header">
      <div class="project-detail-contributors-copy">
        <h2>Contributors ({{ contributors.length }})</h2>
        <p>Manage people and their project roles.</p>
      </div>

      <button
        v-if="props.canManage"
        class="btn btn-primary project-detail-contributors-add"
        type="button"
        :disabled="props.addingContributor"
        @click="openAddContributorDialog"
      >
        <app-icon
          variant="add"
          size="20"
          no-margin
        />
        <span>Add Contributor</span>
      </button>
    </header>

    <div class="project-detail-contributors-toolbar">
      <div class="project-detail-contributors-search">
        <label
          class="visually-hidden"
          for="project-detail-contributors-search"
        >Search contributors</label>
        <input
          id="project-detail-contributors-search"
          v-model.trim="searchQuery"
          class="form-control"
          type="search"
          placeholder="Search contributors..."
        >
        <span
          class="project-detail-contributors-search-icon"
          aria-hidden="true"
        >
          <app-icon
            variant="search"
            size="20"
            no-margin
          />
        </span>
      </div>

      <div class="project-detail-contributors-filter">
        <label
          class="visually-hidden"
          for="project-detail-contributors-role"
        >Role</label>
        <app-select
          id="project-detail-contributors-role"
          v-model="selectedRole"
          :options="roleOptions"
          :aria-label="'Filter contributors by role'"
          placeholder="All Roles"
        />
      </div>
    </div>

    <div class="project-detail-contributors-list-wrap">
      <ul
        v-if="paginatedContributors.length > 0"
        class="project-detail-contributors-list"
      >
        <li
          v-for="contributor in paginatedContributors"
          :key="contributor.id"
          class="project-detail-contributors-item"
          :class="{ 'project-detail-contributors-item-updating': props.updatingContributorId === contributor.id }"
        >
          <div class="project-detail-contributors-person-wrap">
            <div
              class="project-detail-contributors-avatar"
              aria-hidden="true"
            >
              {{ getContributorInitial(contributor.name) }}
            </div>

            <div class="project-detail-contributors-person">
              <h3>{{ contributor.name }}</h3>
              <p>{{ formatContributorMeta(contributor) }}</p>
            </div>
          </div>

          <div class="project-detail-contributors-role-cell">
            <div class="project-detail-contributors-role-actions">
              <app-select
                :id="`project-detail-contributor-role-${contributor.id}`"
                :model-value="localRoles[contributor.id] ?? contributor.role"
                :aria-label="`Change role for ${contributor.name}`"
                :disabled="!props.canManage || props.updatingContributorId === contributor.id"
                :options="rowRoleOptions"
                @update:model-value="handleRoleSelectUpdate(contributor, $event)"
              />

              <button
                v-if="props.canManage"
                class="btn btn-outline-danger project-detail-contributors-delete"
                type="button"
                :disabled="props.updatingContributorId === contributor.id"
                :aria-label="`Remove ${contributor.name}`"
                @click="emit('remove-contributor', contributor)"
              >
                <app-icon
                  variant="delete"
                  size="18"
                  no-margin
                />
              </button>
            </div>
          </div>
        </li>
      </ul>

      <p
        v-else
        class="project-detail-contributors-empty"
      >
        No contributors match these filters.
      </p>
    </div>

    <footer class="project-detail-contributors-footer">
      <div class="project-detail-contributors-footer-copy">
        <p>{{ paginationSummary }}</p>
      </div>

      <div class="project-detail-contributors-footer-controls">
        <div class="project-detail-contributors-rows">
          <span>Rows per page:</span>
          <app-select
            id="project-detail-contributors-page-size"
            v-model="pageSize"
            :options="pageSizeOptions"
            :aria-label="'Rows per page'"
          />
        </div>

        <nav
          class="project-detail-contributors-pagination"
          aria-label="Contributors pagination"
        >
          <button
            type="button"
            :disabled="currentPage === 1"
            aria-label="Previous page"
            @click="currentPage -= 1"
          >
            <app-icon
              variant="chevron_left"
              size="22"
              no-margin
            />
          </button>

          <template
            v-for="item in visiblePaginationItems"
            :key="item.key"
          >
            <span
              v-if="item.type === 'ellipsis'"
              class="project-detail-contributors-pagination-ellipsis"
              aria-hidden="true"
            >
              ...
            </span>

            <button
              v-else
              type="button"
              :class="{ 'project-detail-contributors-pagination-active': item.page === currentPage }"
              :aria-current="item.page === currentPage ? 'page' : undefined"
              @click="currentPage = item.page"
            >
              {{ item.page }}
            </button>
          </template>

          <button
            type="button"
            :disabled="currentPage === totalPages"
            aria-label="Next page"
            @click="currentPage += 1"
          >
            <app-icon
              variant="chevron_right"
              size="22"
              no-margin
            />
          </button>
        </nav>
      </div>
    </footer>

    <workspace-project-details-add-contributor-dialog
      ref="addContributorDialog"
      :existing-user-ids="contributors.map(contributor => contributor.id)"
      :loading="props.availableUsersLoading"
      :saving="props.addingContributor"
      :users="props.availableUsers"
      @submit="emit('add-contributor', $event)"
      @update:search="emit('search-available-users', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import type { ComponentExposed } from 'vue-component-type-helpers';

import { usePagination } from '~/composables/usePagination';

import WorkspaceProjectDetailsAddContributorDialog from '~/components/workspace-project-details/AddContributorDialog.vue';
import type { ProjectWizardWorkspaceUser } from '~/types/project-wizard';
import type { WorkspaceProjectContributor, WorkspaceProjectContributorRole } from '~/types/projects';

type RoleFilter = WorkspaceProjectContributorRole | 'all';

interface SelectOption {
  label: string;
  value: string;
}

interface Props {
  /** Whether the current user may add, update, or remove contributors. */
  canManage: boolean;
  addingContributor: boolean;
  availableUsers: ProjectWizardWorkspaceUser[];
  availableUsersLoading: boolean;
  contributors: WorkspaceProjectContributor[];
  updatingContributorId?: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'add-contributor': [payload: { role: WorkspaceProjectContributorRole; userId: string }];
  'open-add-contributor': [];
  'remove-contributor': [contributor: WorkspaceProjectContributor];
  'search-available-users': [value: string];
  'update-role': [payload: { contributorId: string; role: WorkspaceProjectContributorRole }];
}>();
const addContributorDialog = useTemplateRef<ComponentExposed<typeof WorkspaceProjectDetailsAddContributorDialog>>('addContributorDialog');

const searchQuery = ref('');
const selectedRole = ref<RoleFilter>('all');
const pageSize = ref('10');
const localRoles = ref<Record<string, WorkspaceProjectContributorRole>>({});
const contributors = computed(() => props.contributors ?? []);

const roleOptions: SelectOption[] = [
  { label: 'All Roles', value: 'all' },
  { label: 'Lead', value: 'lead' },
  { label: 'Validator', value: 'validator' },
  { label: 'Contributor', value: 'contributor' },
];

const rowRoleOptions: SelectOption[] = [
  { label: 'Lead', value: 'lead' },
  { label: 'Validator', value: 'validator' },
  { label: 'Contributor', value: 'contributor' },
];

const pageSizeOptions: SelectOption[] = [
  { label: '10', value: '10' },
  { label: '20', value: '20' },
  { label: '50', value: '50' },
];

const normalizedPageSize = computed(() => Number(pageSize.value));

watch(() => props.contributors, (contributors) => {
  localRoles.value = Object.fromEntries(
    (contributors ?? []).map(contributor => [contributor.id, contributor.role]),
  );
}, { immediate: true });

const filteredContributors = computed(() => {
  const normalizedSearch = searchQuery.value.toLowerCase();

  return contributors.value.filter((contributor) => {
    const contributorName = contributor.name ?? '';
    const contributorId = contributor.id ?? '';
    const contributorRole = contributor.role ?? 'contributor';
    const matchesSearch = !normalizedSearch
      || contributorName.toLowerCase().includes(normalizedSearch)
      || contributorId.toLowerCase().includes(normalizedSearch)
      || contributorRole.toLowerCase().includes(normalizedSearch);

    const matchesRole = selectedRole.value === 'all' || contributorRole === selectedRole.value;

    return matchesSearch && matchesRole;
  });
});

const sortedContributors = computed(() =>
  [...filteredContributors.value].sort((left, right) => {
    const timeDelta = getSafeTime(right.updatedAt) - getSafeTime(left.updatedAt);

    if (timeDelta !== 0) {
      return timeDelta;
    }

    return (left.name ?? '').localeCompare(right.name ?? '');
  }),
);

const { currentPage, totalPages, paginatedItems: paginatedContributors, visiblePaginationItems } = usePagination(
  () => sortedContributors.value,
  () => normalizedPageSize.value
);

const paginationSummary = computed(() => {
  if (sortedContributors.value.length === 0) {
    return 'Showing 0 contributors';
  }

  const start = (currentPage.value - 1) * normalizedPageSize.value + 1;
  const end = start + paginatedContributors.value.length - 1;

  return `${start}-${end} of ${sortedContributors.value.length}`;
});

watch([searchQuery, selectedRole, pageSize], () => {
  currentPage.value = 1;
});

function formatRole(role: WorkspaceProjectContributorRole) {
  switch (role) {
    case 'lead':
      return 'Lead';
    case 'validator':
      return 'Validator';
    case 'contributor':
    default:
      return 'Contributor';
  }
}

function formatContributorMeta(contributor: WorkspaceProjectContributor) {
  return `${formatRole(contributor.role)} access`;
}

function getContributorInitial(name: string | null | undefined) {
  return name?.trim().charAt(0).toUpperCase() || '?';
}

function getSafeTime(date: Date | null | undefined) {
  if (!(date instanceof Date)) {
    return 0;
  }

  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function handleRoleChange(contributor: WorkspaceProjectContributor, role: WorkspaceProjectContributorRole) {
  if (role === contributor.role) {
    return;
  }

  emit('update-role', {
    contributorId: contributor.id,
    role,
  });
}

function handleRoleSelectUpdate(
  contributor: WorkspaceProjectContributor,
  value: string | number | null,
) {
  if (!isWorkspaceProjectContributorRole(value)) {
    return;
  }

  localRoles.value = {
    ...localRoles.value,
    [contributor.id]: value,
  };

  handleRoleChange(contributor, value);
}

function isWorkspaceProjectContributorRole(value: unknown): value is WorkspaceProjectContributorRole {
  return ['lead', 'validator', 'contributor'].includes(String(value));
}

function openAddContributorDialog() {
  emit('open-add-contributor');
  addContributorDialog.value?.show();
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-detail-contributors-card {
  display: grid;
  gap: 1.25rem;
  padding: 1rem 1rem 0.85rem;
  background: linear-gradient(180deg, rgba(#ffffff, 0.98) 0%, rgba(#fbfbff, 0.96) 100%);
}

.project-detail-contributors-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.project-detail-contributors-add {
  min-height: 3rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding-inline: 1rem;
  flex-shrink: 0;
}

.project-detail-contributors-copy h2 {
  margin: 0;
  color: #1a1e3d;
  font-size: 1.9rem;
  font-family: var(--secondary-font-family);
  font-weight: 700;
}

.project-detail-contributors-copy p {
  margin: 0.35rem 0 0;
  color: #66708f;
  font-size: 1rem;
}

.project-detail-contributors-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 13.5rem);
  gap: 1rem;
  align-items: end;
}

.project-detail-contributors-search {
  position: relative;
}

.project-detail-contributors-search .form-control {
  min-height: 3.1rem;
  padding-left: 2.75rem;
  color: #3f4763;
  background: #ffffff;
  border-color: rgba($text-navy, 0.1);
  border-radius: 0.85rem;
  box-shadow: inset 0 1px 2px rgba($text-navy, 0.02);
}

.project-detail-contributors-search-icon {
  position: absolute;
  top: 50%;
  left: 0.9rem;
  color: #9aa0b8;
  transform: translateY(-50%);
}

.project-detail-contributors-filter {
  min-width: 0;
}

.project-detail-contributors-card :deep(.tdei-select-toggle) {
  min-height: 3.1rem;
  padding: 0.75rem 0.9rem;
  color: #4f5672;
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 0.85rem;
  box-shadow: inset 0 1px 2px rgba($text-navy, 0.02);
}

.project-detail-contributors-card :deep(.tdei-select-menu) {
  margin-top: 0.45rem;
  border-radius: 0.95rem;
  box-shadow: 0 1rem 2.5rem rgba($text-navy, 0.15);
}

.project-detail-contributors-list-wrap {
  border: 1px solid rgba($text-navy, 0.08);
  border-radius: 1rem;
  background: #ffffff;
  overflow: visible;
}

.project-detail-contributors-item {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(17rem, 1fr);
  gap: 1rem;
  align-items: center;
}

.project-detail-contributors-list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: visible;
}

.project-detail-contributors-item {
  padding: 1rem 1.25rem;
  border-top: 1px solid rgba($text-navy, 0.08);
}

.project-detail-contributors-item:first-child {
  border-top: 0;
}

.project-detail-contributors-item-updating {
  background: rgba(106, 87, 214, 0.03);
}

.project-detail-contributors-person-wrap {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-width: 0;
}

.project-detail-contributors-avatar {
  width: 2.6rem;
  height: 2.6rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #5d5abf;
  font-size: 1rem;
  font-weight: 700;
  background: linear-gradient(135deg, #efe7fb 0%, #edf1ff 100%);
  border: 1px solid rgba(#7150d0, 0.14);
  border-radius: 50%;
}

.project-detail-contributors-person {
  min-width: 0;
}

.project-detail-contributors-person h3 {
  margin: 0;
  color: #1a1e3d;
  font-size: 1rem;
  font-family: var(--secondary-font-family);
  font-weight: 700;
}

.project-detail-contributors-person p {
  margin: 0.22rem 0 0;
  color: #66708f;
  font-size: 0.93rem;
}

.project-detail-contributors-role-cell {
  min-width: 0;
}

.project-detail-contributors-role-cell {
  width: 100%;
}

.project-detail-contributors-role-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.project-detail-contributors-role-cell :deep(.tdei-select) {
  max-width: 12.5rem;
  flex: 1 1 auto;
}

.project-detail-contributors-role-cell :deep(.tdei-select-toggle) {
  min-height: 2.75rem;
  padding: 0.7rem 0.9rem;
  font-weight: 600;
  border-radius: 0.8rem;
}

.project-detail-contributors-role-cell :deep(.tdei-select-menu) {
  min-width: 100%;
  max-height: 14rem;
  overflow-y: auto;
}

.project-detail-contributors-delete {
  width: 2.75rem;
  height: 2.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 0.8rem;
  flex: 0 0 auto;
}

.project-detail-contributors-empty {
  margin: 0;
  padding: 1.25rem;
  color: #5a607b;
  text-align: center;
}

.project-detail-contributors-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.project-detail-contributors-footer-copy p {
  margin: 0;
  color: #5a607b;
  font-size: 0.95rem;
}

.project-detail-contributors-footer-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-left: auto;
}

.project-detail-contributors-rows {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.project-detail-contributors-rows span {
  color: #5a607b;
  font-size: 0.9rem;
  font-weight: 600;
}

.project-detail-contributors-rows :deep(.tdei-select-toggle) {
  min-width: 4.6rem;
  min-height: 2.65rem;
  padding: 0.55rem 0.8rem;
  border-radius: 0.8rem;
}

.project-detail-contributors-pagination {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.project-detail-contributors-pagination button {
  min-width: 2.15rem;
  width: 2.15rem;
  height: 2.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #59607a;
  background: transparent;
  border: 0;
  border-radius: 0.45rem;
}

.project-detail-contributors-pagination-active {
  color: #ffffff !important;
  background: $primary !important;
}

.project-detail-contributors-pagination-ellipsis {
  min-width: 1.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #7b819c;
  font-size: 1rem;
}

.project-detail-contributors-pagination button:disabled {
  opacity: 0.45;
}

@include media-breakpoint-down(md) {
  .project-detail-contributors-header {
    flex-direction: column;
    align-items: stretch;
  }

  .project-detail-contributors-add {
    width: 100%;
    justify-content: center;
  }

  .project-detail-contributors-toolbar {
    grid-template-columns: 1fr;
  }

  .project-detail-contributors-item {
    grid-template-columns: 1fr;
    gap: 0.8rem;
  }
}

@include media-breakpoint-down(sm) {
  .project-detail-contributors-card {
    padding: 1rem;
  }

  .project-detail-contributors-footer-controls {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
