<template>
  <section class="card mb-4">
    <div class="card-body">
      <form @submit.prevent="rename">
        <label class="d-block mb-3">
          Workspace Title
          <input
            v-model.trim="workspaceName"
            class="form-control"
          >
        </label>

        <button
          type="submit"
          class="btn btn-primary"
        >
          Rename
        </button>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { toast } from 'vue3-toastify';
import { workspacesClient } from '~/services/index';

import type { Workspace } from '~/types/workspaces';

const workspace = inject<Workspace>('workspace')!;
const workspaceName = ref(workspace.title);

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
</script>
