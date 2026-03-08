<template>
  <section class="card mb-4">
    <div class="card-body">
      <b-alert
        v-if="!isLead"
        variant="info"
        show
        class="mb-3"
      >
        <app-icon variant="info" />
        Only workspace owners can change workspace settings.
      </b-alert>
      <form @submit.prevent="rename">
        <label class="d-block mb-3">
          Workspace Title
          <input
            v-model.trim="workspaceName"
            class="form-control"
            :disabled="!isLead"
          >
        </label>

        <button
          type="submit"
          class="btn btn-primary"
          :disabled="!isLead"
        >
          Rename
        </button>
      </form>

      <hr>

      <div class="form-check form-switch">
        <input
          id="autoFlagReview"
          v-model="autoFlagReview"
          type="checkbox"
          class="form-check-input"
          :disabled="!isLead"
          @change="saveAutoFlagReview"
        >
        <label
          class="form-check-label"
          for="autoFlagReview"
        >
          Auto-flag contributor changesets for review
        </label>
      </div>
      <small class="text-muted">
        When enabled, changesets created by contributors (non-leads and non-validators)
        will be automatically flagged for review in the review queue.
      </small>
    </div>
  </section>
</template>

<script setup lang="ts">
import { toast } from 'vue3-toastify';
import { workspacesClient } from '~/services/index';

import type { Workspace } from '~/types/workspaces';

const workspace = inject<Workspace>('workspace')!;
const { isLead } = useWorkspaceRole();
const workspaceName = ref(workspace.title);
const autoFlagReview = ref(workspace.autoFlagReview ?? false);

async function rename() {
  try {
    await workspacesClient.updateWorkspace(workspace.id, {
      title: workspaceName.value,
    });
    toast.success('Workspace renamed successfully.');
  }
  catch (e) {
    if (e instanceof Error) {
      toast.error('Rename failed: ' + e.message);
    }
    else {
      toast.error('Rename failed: unexpected error');
    }
  }
}

async function saveAutoFlagReview() {
  try {
    await workspacesClient.updateWorkspace(workspace.id, {
      autoFlagReview: autoFlagReview.value,
    });
    toast.success('Review settings saved.');
  }
  catch (e) {
    autoFlagReview.value = !autoFlagReview.value;
    toast.error('Failed to save review settings.');
  }
}
</script>
