<template>
  <b-modal
    ref="modal"
    title="Team Members"
    ok-title="Close"
    ok-only
  >
    <app-spinner
      v-if="loading.active"
      class="d-block mx-auto"
    />
    <b-alert
      v-else-if="!members.length"
      variant="info"
      class="mt-4"
      show
    >
      <app-icon variant="info" />
      No members have been assigned to this team yet.
    </b-alert>
    <b-list-group v-else>
      <b-list-group-item
        v-for="user in members"
        :key="user.id"
        class="d-flex align-items-center"
      >
        <app-icon variant="person" />
        {{ user.display_name }}

        <div class="align-self-center flex-shrink-0 ms-auto">
          <button
            class="btn ms-1 px-1 py-0 text-danger"
            @click="remove(user)"
          >
            <app-icon
              variant="close"
              no-margin
            />
            <span class="visually-hidden">Remove Member</span>
          </button>
        </div>
      </b-list-group-item>
    </b-list-group>
  </b-modal>
</template>

<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import type { ComponentExposed } from 'vue-component-type-helpers';

import { LoadingContext } from '~/services/loading';
import { workspacesClient } from '~/services/index';
import type { User, Workspace, WorkspaceTeam } from '~/types/workspaces';

interface Props {
  team?: WorkspaceTeam;
}

const props = defineProps<Props>();
const workspace = inject<Workspace>('workspace')!;
const { create } = useModal();
const modal = useTemplateRef<ComponentExposed<typeof BModal>>('modal');

const loading = reactive(new LoadingContext());
const members = ref<User[]>([]);

defineExpose({ show });
watch(() => props.team, onTeamChange);

async function show() {
  modal.value!.show();
}

async function onTeamChange(team?: WorkspaceTeam) {
  members.value = [];

  if (!team) {
    return;
  }

  await loading.cancelable(workspacesClient, async (client) => {
    members.value = await client.getTeamMembers(workspace.id, props.team!.id);
    props.team!.member_count = members.value.length;
  });
}

async function remove(user: User) {
  const value = await create({
    body: `Remove ${user.display_name} from "${props.team!.name}"?`,
    title: 'Remove Team Member',
    okTitle: 'Remove',
    okVariant: 'danger',
    cancelTitle: 'Cancel',
    cancelVariant: 'link',
  }).show();

  if (value?.ok) {
    const index = members.value.indexOf(user);

    if (index === -1) {
      return;
    }

    members.value.splice(index, 1);
    props.team!.member_count--;

    await workspacesClient.removeFromTeam(workspace.id, props.team!.id, user.id);
  }
}
</script>
