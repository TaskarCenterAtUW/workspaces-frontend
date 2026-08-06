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
          :disabled="!isLead || attestation !== 'delete' || isDeleting"
          :aria-busy="isDeleting"
          @click="submitDelete"
        >
          <template v-if="isDeleting">
            <span
              class="spinner-border spinner-border-sm me-2"
              aria-hidden="true"
            />
            Deleting&hellip;
          </template>
          <template v-else>
            Delete this workspace
          </template>
        </button>
      </template>
    </div>
    <!-- .card-body -->
  </div>
  <!-- .card -->
</template>

<script setup lang="ts">
import { toast } from 'vue3-toastify';
import { workspacesClient } from '~/services/index';

import type { Workspace } from '~/types/workspaces';

const workspace = inject<Workspace>('workspace')!;
const { isLead } = useWorkspaceRole();

const accepted = ref(false);
const attestation = ref('');
const isDeleting = ref(false);
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
  if (!isLead.value || attestation.value !== 'delete' || isDeleting.value) {
    return;
  }

  isDeleting.value = true;

  try {
    await workspacesClient.deleteWorkspace(workspace.id);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'unexpected error';
    toast.error('Failed to delete workspace: ' + errorMessage);
    return;
  }
  finally {
    isDeleting.value = false;
  }

  await navigateTo('/dashboard');
}
</script>
