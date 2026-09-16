// Test outline
// @test e2e: only users with POC or team lead permissions should be able to access this page
// @test e2e: POCs should be displayed on this page, matching the results of the simulated API response from the TDEI/KeyCloak.
// @test e2e: Data Generators should be displayed on this page, matching the results of the simulated API response from the TDEI/KeyCloak.
// @test e2e: Workspace Members, which includes Owners or Validators, should be displayed on this page, matching the results of the simulated API response from the TDEI/KeyCloak.
// @test e2e: Workspace Members can have one of three permissions assigned to them which should match the response of the Workspaces API call to fetch permissions: "Member", "Owner" or "Validator".
// @test e2e: The permissions structure on this page should match the one described in CLAUDE.md
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
// @test e2e: validate that each member has a badge or clear role via being listed under a header that names the role
<template>
  <b-col lg="7" class="workspace-setting-tab-column-right">
    <b-alert
      v-if="accessDenied"
      variant="info"
      show
      class="mb-4"
    >
      <app-icon variant="info" />
      You need a TDEI POC role in this project group to view and manage
      workspace member roles.
    </b-alert>

    <div class="members-group">
      <div class="group-heading">
        <h3 class="members-group-heading">
          Project Group Admins
          <app-icon
            variant="local_police"
            size="24"
          />
        </h3>
        <p class="members-group-subheading">
          TDEI project group admins (POCs) have full control of the workspace and
          all workspace settings.
        </p>
      </div>
      <b-list-group
        v-if="pocs.length"
        class="mb-2"
      >
        <b-list-group-item
          v-for="m in pocs"
          :key="m.user_id"
          class="d-flex align-items-center member-list-item"
        >
          <div class="me-auto member-details-card">
            <img
              :src="memberIcon"
              class="member-icon"
              alt=""
            >
            <div class="member-details">
              <div class="member-name">{{ m.first_name }} {{ m.last_name }}</div>
              <div class="member-email">{{ m.email }}</div>
            </div>
          </div>
          <b-badge class="member-badge">
            <app-icon variant="lock" /> poc
          </b-badge>
        </b-list-group-item>
      </b-list-group>
      <b-alert
        v-else
        class="mb-5"
        variant="light"
        show
      >
        <app-icon variant="info" />
        No one has a TDEI POC role in this project group.
      </b-alert>
    </div>

    <div class="members-group">
      <div class="group-heading">
        <h3 class="members-group-heading">
          Data Generators
          <app-icon
            variant="offline_bolt"
            size="24"
          />
        </h3>
        <p class="members-group-subheading">
          Members with a TDEI data generator role can export workspace data to the
          TDEI.
        </p>
      </div>
      <b-list-group
        v-if="generators.length"
        class="mb-2"
      >
        <b-list-group-item
          v-for="m in generators"
          :key="m.user_id"
          class="d-flex align-items-center member-list-item"
        >
          <div class="me-auto member-details-card">
            <img
              :src="memberIcon"
              class="member-icon"
              alt=""
            >
            <div class="member-details">
              <div class="member-name">{{ m.first_name }} {{ m.last_name }}</div>
              <div class="member-email">{{ m.email }}</div>
            </div>
          </div>
          <template
            v-for="role in m.roles"
            :key="role"
          >
            <b-badge
              v-if="role.endsWith('_data_generator')"
              class="member-badge"
            >
              <app-icon variant="lock" /> {{ formatDataGeneratorRole(role) }}
            </b-badge>
          </template>
        </b-list-group-item>
      </b-list-group>
      <b-alert
        v-else
        class="mb-5"
        variant="light"
        show
      >
        <app-icon variant="info" />
        No one has a TDEI data generator role in this project group.
      </b-alert>
    </div>

    <div class="members-group">
      <div class="group-heading">
        <h3 class="members-group-heading">
          Workspace Members
          <app-icon
            variant="edit_location_alt"
            size="24"
          />
        </h3>
        <p class="members-group-subheading">
          Members of the TDEI project group can access and modify data in this
          workspace.
        </p>
      </div>
      <div class="privilege-card">
        <img
          :src="infoIcon"
          class="info-icon"
          alt=""
        >
        <div class="content">
          <div class="title">
            Following roles have additional privileges.
          </div>
          <div class="role">
            <strong>Owner</strong> can review changesets and modify workspace settings
          </div>
          <div class="role">
            <strong>Validator</strong> can review changesets
          </div>
        </div>
      </div>
      <b-list-group v-if="members.length">
        <b-list-group-item
          v-for="m in members"
          :key="m.user_id"
          class="d-flex align-items-center member-list-item"
        >
          <div class="me-auto member-details-card">
            <img
              :src="memberIcon"
              class="member-icon"
              alt=""
            >
            <div class="member-details">
              <div class="member-name">{{ m.first_name }} {{ m.last_name }}</div>
              <div class="member-email">{{ m.email }}</div>
            </div>
          </div>

          <!-- Lead: functional role dropdown -->
          <b-dropdown
            v-if="isLead"
            variant="light"
            size="sm"
            :text="roleLabel(m.localRole)"
            placement="bottom-end"
          >
            <b-dropdown-item @click="setRole(m, 'lead')">
              <app-icon
                variant="check"
                :class="m.localRole === 'lead' ? '' : 'invisible'"
              />
              Owner
            </b-dropdown-item>
            <b-dropdown-item @click="setRole(m, 'validator')">
              <app-icon
                variant="check"
                :class="m.localRole === 'validator' ? '' : 'invisible'"
              />
              Validator
            </b-dropdown-item>
            <b-dropdown-item @click="setRole(m, undefined)">
              <app-icon
                variant="check"
                :class="!m.localRole ? '' : 'invisible'"
              />
              Member
            </b-dropdown-item>
          </b-dropdown>

          <!-- Non-lead: read-only role badge -->
          <b-badge
            v-else
            variant="secondary"
            class="member-badge"
          >
            {{ roleLabel(m.localRole) }}
          </b-badge>
        </b-list-group-item>
      </b-list-group>
      <b-alert
        v-else
        class="mb-5"
        variant="light"
        show
      >
        <app-icon variant="info" />
        There are no unprivileged members in this project group.
      </b-alert>
    </div>
  </b-col>
</template>

<script setup lang="ts">
import { toast } from 'vue3-toastify';
import { WorkspacesClientError } from '~/services/workspaces';
import { TdeiUserClientError } from '~/services/tdei';
import { tdeiUserClient, workspacesClient } from '~/services/index';
import { ROLE_LABELS } from '~/util/roles';
import type { Workspace, WorkspaceRole } from '~/types/workspaces';
import type { TdeiUserItem } from '~/types/tdei';
import memberIcon from '~/assets/img/member-icon.svg';
import infoIcon from '~/assets/img/info-icon.svg';

interface MemberEntry {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  localRole?: WorkspaceRole;
}

const workspace = inject<Workspace>('workspace')!;
const { isLead } = useWorkspaceRole();

let projectGroupUsers: TdeiUserItem[] = [];
let accessDenied = false;

try {
  projectGroupUsers = await tdeiUserClient.getProjectGroupUsers(workspace.tdeiProjectGroupId);
}
catch (e) {
  if (e instanceof TdeiUserClientError && e.response.status === 403) {
    accessDenied = true;
  }
  else {
    throw e;
  }
}

const localRoleMap = new Map<string, WorkspaceRole>();

if (isLead.value) {
  const wsMembers = await workspacesClient.getWorkspaceMembers(workspace.id);
  for (const m of wsMembers) {
    localRoleMap.set(m.user.auth_uid, m.role);
  }
}

const pocs = projectGroupUsers.filter(u => u.roles.includes('poc'));
const generators = projectGroupUsers.filter(
  u => u.roles.some((r: string) => r.endsWith('_data_generator')),
);
const members = ref<MemberEntry[]>(
  projectGroupUsers
    .filter((u: TdeiUserItem) => !u.roles?.includes('poc'))
    .map((u: TdeiUserItem) => ({
      user_id: u.user_id,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      localRole: localRoleMap.get(u.user_id),
    })),
);

function roleLabel(role?: WorkspaceRole): string {
  return role ? ROLE_LABELS[role] : ROLE_LABELS.contributor;
}

function formatDataGeneratorRole(role: string) {
  const index = role.indexOf('_');
  return role.substring(0, index);
}

async function setRole(member: MemberEntry, role?: WorkspaceRole) {
  if (role === member.localRole) return;

  try {
    if (!role) {
      await workspacesClient.removeRole(workspace.id, member.user_id);
    }
    else {
      await workspacesClient.assignRole(workspace.id, member.user_id, role);
    }
    member.localRole = role;
  }
  catch (e) {
    if (e instanceof WorkspacesClientError && e.response.status === 404) {
      toast.error('This member has never signed in to Workspaces and cannot be assigned a role yet.');
    }
    else {
      toast.error(e instanceof Error ? e.message : 'Failed to update role');
    }
  }
}
</script>
<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";
.workspace-setting-tab-column-right {
  padding: 30px 30px;
  border-left: 1px solid rgba(26, 30, 61, 0.08);
}
.members-group {
    border: 1px solid #CED4DA;
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 25px;
}
.members-group-heading {
    font-size: 18px;
    font-weight: 600;
    color: $text-navy;
    margin-bottom: 5px;
    display: flex;
    align-items: center;
    gap: 5px;
}
.members-group-subheading {
    font-size: 14px;
    color: $text-secondary;
    margin-bottom: 20px;
}
.group-heading {
    border-bottom: 1px dashed #CED4DA;
    margin-bottom: 20px;
}
.member-list-item {
  border: none;
  border-bottom: 1px solid #e5e5e5;
  padding: 15px 0px;
}
.member-list-item:nth-last-child(1) {
  border-bottom: none;
}
.member-details-card {
  display: flex;
  align-items: flex-start;
  .member-details {
    margin-left: 10px;
    .member-name {
      font-weight: 600;
    }
    .member-email {
      font-size: 14px;
      color: $text-secondary;
    }
  }
  .member-icon {
      width: 40px;
      height: 40px;
  }
}
.member-badge {
  background-color: #F5F5FA !important;
  border: 1px solid #DCDDEB !important;
  color: #565C78 !important;
  padding: 6px 12px !important;
  border-radius: 25px;
  font-size: 12px;
  display: flex;
  align-items: center;
  text-transform: uppercase;
}
.privilege-card {
    display: flex;
    align-items: flex-start;
    background-color: #fcfdff;
    border: 1px solid #E9ECF4;
    padding: 15px;
    border-radius: 10px;
    margin-bottom: 20px;
    .content {
        margin-left: 10px;
    }
    .title {
        font-weight: 600;
        margin-bottom: 5px;
    }
    .role {
        font-size: 14px;
        color: $text-secondary;
        font-weight: 500;
    }
    .info-icon {
        width: 40px;
        height: 40px;
    }
}
.role-dropdown {
  border: 1px solid #CED4DA;
  padding: 6px 12px;
  background-color: #ffffff;
  border-radius: 5px;
}

</style>
