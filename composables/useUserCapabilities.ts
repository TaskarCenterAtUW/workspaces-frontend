import { computed } from 'vue';
import { tdeiUserClient } from '~/services/index';
import type { TdeiProjectGroup } from '~/types/tdei';

// hasCreationRole checks if the user has the creation role for a given project group and dataset type.
// Must match the backend's _CREATABLE_WORKSPACE_TYPES (api/core/security.py), which
// gives tdei-admin no creation rights -- it is a TDEI realm role, not a project-group role.
export function hasCreationRole(roles: string[] = [], type?: string): boolean {
  const normalized = roles.map(r => r.trim().toLowerCase());
  if (normalized.includes('poc')) {
    return true;
  }
  if (type) {
    return normalized.includes(`${type.trim().toLowerCase()}_data_generator`);
  }
  return normalized.some(r => r.endsWith('_data_generator'));
}

export function useUserCapabilities() {
  const projectGroups = useState<TdeiProjectGroup[]>('user-project-groups', () => []);
  const loading = useState<boolean>('user-project-groups-loading', () => false);
  const loaded = useState<boolean>('user-project-groups-loaded', () => false);

  async function load(force = false): Promise<TdeiProjectGroup[]> {
    if (loaded.value && !force) {
      return projectGroups.value;
    }
    loading.value = true;
    try {
      const { items } = await tdeiUserClient.getMyProjectGroups(1, '', 10000);
      projectGroups.value = items;
      loaded.value = true;
      return items;
    } catch (e) {
      console.error('Failed to load user project groups for capabilities', e);
      return projectGroups.value;
    } finally {
      loading.value = false;
    }
  }

  function setProjectGroups(groups: TdeiProjectGroup[]) {
    projectGroups.value = groups;
    loaded.value = true;
  }

  const eligibleCreationProjectGroups = computed(() =>
    projectGroups.value.filter(pg => hasCreationRole(pg.roles))
  );

  const canCreateAnyWorkspace = computed(() => eligibleCreationProjectGroups.value.length > 0);

  function canCreateInProjectGroup(projectGroupId: string | null | undefined, type?: string): boolean {
    if (!projectGroupId) return false;
    const pg = projectGroups.value.find(g => g.tdei_project_group_id === projectGroupId);
    return pg ? hasCreationRole(pg.roles, type) : false;
  }

  function getEligibleProjectGroupsForType(type?: string): TdeiProjectGroup[] {
    return projectGroups.value.filter(pg => hasCreationRole(pg.roles, type));
  }

  return {
    projectGroups,
    loading,
    loaded,
    load,
    setProjectGroups,
    eligibleCreationProjectGroups,
    canCreateAnyWorkspace,
    canCreateInProjectGroup,
    getEligibleProjectGroupsForType
  };
}
