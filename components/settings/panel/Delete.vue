<template>
  <div class="card mb-4 border-danger">
    <div class="card-body">
      <h3 class="card-title mb-3">
        Delete Workspace
      </h3>

      <b-alert
        v-if="!isLead"
        variant="info"
        show
        class="mb-3"
      >
        <app-icon variant="info" />
        Only workspace owners can delete the workspace.
      </b-alert>

      <p>
        Deleting a workspace is permanent. This action will not remove any
        TDEI datasets outside of Workspaces.
      </p>

      <button
        class="btn btn-danger mb-3"
        :disabled="!isLead || accepted"
        @click="acceptDelete"
      >
        I understand, and I want to delete this workspace
      </button>

      <template v-if="accepted">
        <label class="d-block mb-3">
          <strong>To confirm, please type "delete" in the box below:</strong>
          <input
            ref="input"
            v-model.trim="attestation"
            class="form-control border-danger"
          >
        </label>

        <button
          class="btn btn-danger"
          :disabled="!isLead || attestation !== 'delete'"
          @click="submitDelete"
        >
          Delete this workspace
        </button>
      </template>
    </div>
    <!-- .card-body -->
  </div>
  <!-- .card -->
</template>

<script setup lang="ts">
import { workspacesClient } from '~/services/index';

import type { Workspace } from '~/types/workspaces';

const workspace = inject<Workspace>('workspace')!;
const { isLead } = useWorkspaceRole();

const accepted = ref(false);
const attestation = ref('');
const input = useTemplateRef<HTMLInputElement>('input');

async function acceptDelete() {
  if (!isLead.value) {
    return;
  }

  accepted.value = true;
  await nextTick();
  input.value!.focus();
}

async function submitDelete() {
  if (!isLead.value) {
    return;
  }

  await workspacesClient.deleteWorkspace(workspace.id);
  navigateTo('/dashboard');
}
</script>
