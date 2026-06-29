<template>
  <div class="col-lg-8">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="mb-0">
        Teams
      </h3>
      <b-popover
        content="Only workspace owners can create teams"
        :manual="isLead"
      >
        <template #target>
          <div class="d-inline-block">
            <b-button
              variant="primary"
              class="flex-shrink-0"
              :disabled="!isLead"
              @click="openNewDialog"
            >
              <app-icon variant="add" /> New Team
            </b-button>
          </div>
        </template>
      </b-popover>
    </div>

    <b-alert
      v-if="!isLead"
      variant="info"
      show
      class="mb-3"
    >
      <app-icon variant="info" />
      Only workspace owners can create, rename, or delete teams.
    </b-alert>
    <b-alert
      v-if="!teams.length"
      variant="info"
      class="mt-4"
      show
    >
      <app-icon variant="info" />
      No teams exist in this workspace.
    </b-alert>
    <b-list-group v-else>
      <teams-item
        v-for="team in teams"
        :key="team.id"
        :team="team"
        :is-lead="isLead"
        @join="openJoinDialog"
        @open-settings="openSettingsDialog"
        @remove="remove"
        @view-members="openMembersDialog"
      />
    </b-list-group>

    <teams-settings-dialog
      ref="settingsDialog"
      :team="selectedTeam"
      @created="onSaved"
      @updated="onSaved"
    />
    <teams-members-dialog
      ref="membersDialog"
      :team="selectedTeam"
    />
    <teams-join-dialog
      ref="joinDialog"
      :team="selectedTeam"
    />
  </div>
</template>

<script setup lang="ts">
import { useModal } from 'bootstrap-vue-next/composables/useModal';

import { workspacesClient } from '~/services/index';

import type TeamsJoinDialog from '~/components/teams/JoinDialog.vue';
import type TeamsMembersDialog from '~/components/teams/MembersDialog.vue';
import type TeamsSettingsDialog from '~/components/teams/SettingsDialog.vue';
import type { WorkspaceTeam } from '~/types/workspaces';

const { isLead } = useWorkspaceRole();
const { create } = useModal();
const route = useRoute();
const workspaceId = Number(route.params.id);
const teams = ref<WorkspaceTeam[]>([]);
const selectedTeam = ref<WorkspaceTeam | undefined>();

const joinTeamDialog = useTemplateRef<typeof TeamsJoinDialog>('joinDialog');
const membersDialog = useTemplateRef<typeof TeamsMembersDialog>('membersDialog');
const settingsDialog = useTemplateRef<typeof TeamsSettingsDialog>('settingsDialog');

await refresh();

async function refresh() {
  teams.value = await workspacesClient.getTeams(workspaceId);
}

async function openNewDialog() {
  selectedTeam.value = undefined;
  await nextTick();
  settingsDialog.value!.show();
}

async function openSettingsDialog(team: WorkspaceTeam) {
  selectedTeam.value = team;
  await nextTick();
  settingsDialog.value!.show();
}

function openMembersDialog(team: WorkspaceTeam) {
  selectedTeam.value = team;
  membersDialog.value!.show();
}

function openJoinDialog(team: WorkspaceTeam) {
  selectedTeam.value = team;
  joinTeamDialog.value!.show();
}

async function onSaved() {
  await refresh();
}

async function remove(team: WorkspaceTeam) {
  const value = await create({
    body: `Are you sure you want to delete "${team.name}"?`,
    title: 'Delete Team',
    okTitle: 'Delete',
    okVariant: 'danger',
    cancelTitle: 'Cancel',
    cancelClass: 'btn-link p-0',
    cancelVariant: null,
  }).show();

  if (value?.ok) {
    const index = teams.value.indexOf(team);

    if (index === -1) {
      return;
    }

    teams.value.splice(index, 1);
    await workspacesClient.deleteTeam(workspaceId, team.id);
  }
}
</script>
