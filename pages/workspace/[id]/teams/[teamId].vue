<template>
  <app-page v-if="notFound">
    <div class="text-center mt-5">
      <app-icon
        variant="sentiment_dissatisfied"
        size="48"
        no-margin
      />
    </div>
    <h1 class="h4 mt-2 mb-5 text-center">
      Team not found
    </h1>
    <p class="text-center mb-4">
      This team may not exist anymore, or you may need to ask your team leader
      for access to the project group.
    </p>
    <div class="text-center">
      <return-to-dashboard-button />
    </div>
  </app-page>

  <app-page v-else>
    <div class="text-center mt-5">
      <app-icon
        variant="diversity_3"
        size="48"
        no-margin
      />
    </div>
    <h1 class="mb-5 text-center">
      Join Team
    </h1>

    <b-row align-v="start">
      <b-col
        md="6"
        xl="5"
        xxl="4"
        offset-xl="1"
        offset-xxl="2"
      >
        <b-card class="mb-3">
          <div v-if="!joined">
            You've been invited to join a team:
            <div class="h3">
              {{ team!.name }}
            </div>
            <b-button
              variant="primary"
              :disabled="saving.active"
              @click="join"
            >
              <app-spinner
                v-if="saving.active"
                size="sm"
              />
              <template v-else>
                <app-icon variant="how_to_reg" /> Join Team
              </template>
            </b-button>
          </div>
          <div v-else>
            <div class="h3">
              {{ team!.name }}
            </div>
            <div class="mb-3">
              You already joined this team.
            </div>
            <b-button
              variant="danger"
              :disabled="saving.active"
              @click="leave"
            >
              <app-spinner
                v-if="saving.active"
                size="sm"
              />
              <template v-else>
                <app-icon variant="logout" /> Leave Team
              </template>
            </b-button>
          </div>
        </b-card>

        <b-card class="mb-3">
          <template #header>
            <h2 class="h5 mb-0">
              <app-icon
                variant="edit_location_alt"
                size="24"
              /> Workspace
            </h2>
          </template>

          <nuxt-link :to="workspaceRoute">
            {{ workspace?.title }}
          </nuxt-link>
        </b-card>

        <b-card
          class="mb-3"
          no-body
        >
          <template #header>
            <h2 class="h5 mb-0">
              <app-icon
                variant="people_alt"
                size="24"
              /> On the team
            </h2>
          </template>

          <b-list-group
            v-if="members?.length"
            flush
          >
            <b-list-group-item
              v-for="u in members"
              :key="u.id"
            >
              <app-icon variant="person" /> {{ u.display_name }}
            </b-list-group-item>
          </b-list-group>
          <div
            v-else
            class="p-3"
          >
            No one here yet. Be the first to join!
          </div>
        </b-card>
      </b-col>

      <b-col
        md="6"
        xl="5"
        xxl="4"
      >
        <b-card class="mb-3">
          <template #header>
            <h2 class="h5 mb-0">
              <app-icon
                variant="group_add"
                size="24"
              /> Invite more teammates
            </h2>
          </template>

          <teams-qr-code
            :workspace-id="workspaceId"
            :team-id="teamId"
          />
        </b-card>
      </b-col>
    </b-row>
  </app-page>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading';
import { tdeiAuth, workspacesClient } from '~/services/index';
import { WorkspacesClientError } from '~/services/workspaces';

import type { Workspace, WorkspaceTeam, User } from '~/types/workspaces';

const route = useRoute();
const workspaceId = Number(route.params.id);
const teamId = Number(route.params.teamId);
const loading = reactive(new LoadingContext());
const saving = reactive(new LoadingContext());

let workspace: Workspace | undefined;
let team: WorkspaceTeam | undefined;
const members = ref<User[] | undefined>();
let notFound = false;

try {
  await loading.cancelable(workspacesClient, async (client) => {
    const responses = await Promise.all([
      client.getWorkspace(workspaceId),
      client.getTeam(workspaceId, teamId),
      client.getTeamMembers(workspaceId, teamId),
    ]);
    workspace = responses[0];
    team = responses[1];
    members.value = responses[2];
  });
}
catch (e: unknown) {
  if (e instanceof WorkspacesClientError && e.response.status === 404) {
    notFound = true;
  }
  else {
    throw e;
  }
}

const joined = computed(() => members.value?.some(u => u.auth_uid === tdeiAuth.subject));
const workspaceRoute = computed(() => `/dashboard?workspace=${workspaceId}`);

async function join() {
  await saving.wrap(workspacesClient, async (client) => {
    const user = await client.joinTeam(workspaceId, teamId);
    members.value!.push(user);
  });

  members.value!.sort();
}

async function leave() {
  const member = members.value!.find(u => u.auth_uid === tdeiAuth.subject);

  await saving.wrap(workspacesClient, async (client) => {
    await client.removeFromTeam(workspaceId, teamId, member!.id);
  });

  const index = members.value!.indexOf(member!);
  members.value!.splice(index, 1);
}
</script>
