<template>
  <div class="card mb-4 border-danger">
    <div class="card-body">
      <h3 class="card-title mb-3">
        Delete Workspace
      </h3>

      <p>
        Deleting a workspace is permanent. This action will not remove any
        TDEI datasets outside of Workspaces.
      </p>

      <button
        class="btn btn-outline-danger mb-3"
        :disabled="accepted"
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
          :disabled="attestation !== 'delete'"
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

const accepted = ref(false);
const attestation = ref('');
const input = useTemplateRef<HTMLInputElement>('input');

async function acceptDelete() {
  accepted.value = true;
  await nextTick();
  input.value!.focus();
}

async function submitDelete() {
  await workspacesClient.deleteWorkspace(workspace.id);
  navigateTo('/dashboard');
}
</script>
