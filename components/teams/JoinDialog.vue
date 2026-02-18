<template>
  <b-modal
    ref="modal"
    title="Join this Team"
  >
    <teams-qr-code
      v-if="props.team"
      :workspace-id="workspace.id"
      :team-id="props.team.id"
      @change="updateQrCodeUrl"
    />

    <template #footer="{ hide }">
      <a
        v-if="qrCodeUrl"
        class="btn btn-dark"
        :href="qrCodeUrl"
        :download="qrCodeFilename"
      >
        <app-icon variant="download" />
        Download QR Code
      </a>
      <b-button
        variant="primary"
        @click="hide()"
      >
        Close
      </b-button>
    </template>
  </b-modal>
</template>

<script setup lang="ts">
import slugify from '@sindresorhus/slugify';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import type { ComponentExposed } from 'vue-component-type-helpers';

import type { Workspace, WorkspaceTeam } from '~/types/workspaces';

interface Props {
  team?: WorkspaceTeam;
}

const props = defineProps<Props>();
const workspace = inject<Workspace>('workspace')!;
const modal = useTemplateRef<ComponentExposed<typeof BModal>>('modal');

const teamNameSlug = computed(() => slugify(props.team?.name ?? ''));
const qrCodeUrl = ref('');
const qrCodeFilename = computed(() => `team-${teamNameSlug.value}-qr-code.png`);

defineExpose({ show });

function show() {
  modal.value!.show();
}

function updateQrCodeUrl(dataUrl: string) {
  qrCodeUrl.value = dataUrl;
}
</script>
