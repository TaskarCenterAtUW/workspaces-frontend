<template>
  <b-modal
    ref="modal"
    title="Workspace import failed"
    centered
    ok-only
    ok-title="Close"
  >
    <div
      v-if="loading"
      class="workspace-job-failure-loading"
      aria-live="polite"
    >
      <app-spinner />
      <span>Loading failure details…</span>
    </div>

    <div
      v-else-if="errorMessage"
      class="alert alert-danger mb-0"
      role="alert"
    >
      {{ errorMessage }}
    </div>

    <div
      v-else-if="job"
      class="workspace-job-failure-details"
    >
      <p class="workspace-job-failure-message">
        {{ job.response?.message ?? 'The import failed without an error message.' }}
      </p>

      <dl>
        <div>
          <dt>Failed step</dt>
          <dd>{{ job.current_task ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Error code</dt>
          <dd>{{ job.response?.messageCode ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Job type</dt>
          <dd>{{ job.job_type }}</dd>
        </div>
        <div>
          <dt>Job ID</dt>
          <dd>{{ job.id }}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{{ formatTimestamp(job.updated_at) }}</dd>
        </div>
      </dl>
    </div>

    <div
      v-else
      class="alert alert-warning mb-0"
      role="alert"
    >
      No job details are available for this workspace.
    </div>
  </b-modal>
</template>

<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import type { ComponentExposed } from 'vue-component-type-helpers';
import { workspacesClient } from '~/services/index';
import { resolveHttpErrorMessage } from '~/services/http';

import type { WorkspaceId, WorkspaceJob } from '~/types/workspaces';

const modal = useTemplateRef<ComponentExposed<typeof BModal>>('modal');
const loading = ref(false);
const job = ref<WorkspaceJob | null>(null);
const errorMessage = ref('');
let requestId = 0;

defineExpose({ show });

async function show(workspaceId: WorkspaceId): Promise<void> {
  const activeRequestId = ++requestId;
  job.value = null;
  errorMessage.value = '';
  loading.value = true;
  modal.value?.show();

  try {
    const jobs = await workspacesClient.getWorkspaceJobs(workspaceId);
    if (activeRequestId === requestId) {
      job.value = jobs[0] ?? null;
    }
  }
  catch (error: unknown) {
    if (activeRequestId === requestId) {
      errorMessage.value = await resolveHttpErrorMessage(
        error,
        'Failed to load import failure details.'
      );
    }
  }
  finally {
    if (activeRequestId === requestId) {
      loading.value = false;
    }
  }
}

function formatTimestamp(value: string): string {
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.workspace-job-failure-loading {
  min-height: 8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.75rem;
  color: $text-secondary;
}

.workspace-job-failure-details {
  display: grid;
  gap: 1rem;
}

.workspace-job-failure-message {
  margin: 0;
  padding: 0.85rem 1rem;
  color: $danger-red;
  overflow-wrap: anywhere;
  background-color: rgba($danger-red, 0.06);
  border: 1px solid rgba($danger-red, 0.2);
  border-radius: 0.5rem;
}

.workspace-job-failure-details dl {
  display: grid;
  gap: 0.6rem;
  margin: 0;
}

.workspace-job-failure-details dl > div {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr);
  gap: 0.75rem;
}

.workspace-job-failure-details dt {
  color: $text-secondary;
  font-weight: 600;
}

.workspace-job-failure-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
