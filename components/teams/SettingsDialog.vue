<template>
  <b-modal
    ref="modal"
    :title="title"
  >
    <label class="d-block">
      Team Name
      <b-input v-model.trim="name" />
    </label>

    <template #footer="{ cancel }">
      <b-button
        variant="link"
        @click="cancel()"
      >
        Cancel
      </b-button>
      <b-button
        type="submit"
        variant="primary"
        :disabled="!complete || saving.active"
        @click="save"
      >
        <app-spinner
          v-if="saving.active"
          size="sm"
        />
        <template v-else-if="props.team">
          Update
        </template>
        <template v-else>
          Create
        </template>
      </b-button>
    </template>
  </b-modal>
</template>

<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import type { ComponentExposed } from 'vue-component-type-helpers';

import { LoadingContext } from '~/services/loading';
import { workspacesClient } from '~/services/index';
import type { Workspace, WorkspaceTeam } from '~/types/workspaces';

interface Props {
  team?: WorkspaceTeam;
}

const props = defineProps<Props>();
const workspace = inject<Workspace>('workspace')!;
const emit = defineEmits(['created', 'updated']);
const modal = useTemplateRef<ComponentExposed<typeof BModal>>('modal');

const saving = reactive(new LoadingContext());
const name = ref('');

const title = computed(() => props.team ? 'Team Settings' : 'Create a Team');
const complete = computed(() => name.value.length > 0);

defineExpose({ show });

function show() {
  name.value = props.team?.name ?? '';
  modal.value!.show();
}

async function save() {
  if (props.team) {
    await update();
  }
  else {
    await create();
  }

  modal.value!.hide();
}

async function create() {
  await saving.wrap(workspacesClient, async (client) => {
    const newId = await client.createTeam(workspace.id, name.value);
    emit('created', newId);
  });
}

async function update() {
  await saving.wrap(workspacesClient, async (client) => {
    await client.updateTeam(workspace.id, props.team!.id, name.value);
    emit('updated');
  });
}
</script>
