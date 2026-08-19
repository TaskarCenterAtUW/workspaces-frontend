<template>
  <b-modal
    ref="modal"
    title="Workspace import failed"
    centered
    ok-only
    ok-title="Close"
    @hidden="activeHelpTooltip = null"
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
          <dt>
            <span class="workspace-job-failure-help-wrapper">
              <button
                class="workspace-job-failure-help"
                type="button"
                aria-label="Failed step. Show explanation."
                :aria-describedby="activeHelpTooltip === 'failed-step' ? 'workspace-job-failed-step-tooltip' : undefined"
                @pointerenter="showHelpTooltip('failed-step')"
                @pointerleave="hideHelpTooltip('failed-step')"
                @focus="showHelpTooltip('failed-step')"
                @blur="hideHelpTooltip('failed-step')"
                @click="showHelpTooltip('failed-step')"
              >
                <span>Failed step</span>
                <app-icon
                  variant="info_outline"
                  size="16"
                  no-margin
                  aria-hidden="true"
                />
              </button>
              <span
                v-if="activeHelpTooltip === 'failed-step'"
                id="workspace-job-failed-step-tooltip"
                class="workspace-job-failure-tooltip"
                role="tooltip"
              >
                The part of workspace setup that did not finish.
              </span>
            </span>
          </dt>
          <dd>{{ job.current_task ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>
            <span class="workspace-job-failure-help-wrapper">
              <button
                class="workspace-job-failure-help"
                type="button"
                aria-label="Error code. Show explanation."
                :aria-describedby="activeHelpTooltip === 'error-code' ? 'workspace-job-error-code-tooltip' : undefined"
                @pointerenter="showHelpTooltip('error-code')"
                @pointerleave="hideHelpTooltip('error-code')"
                @focus="showHelpTooltip('error-code')"
                @blur="hideHelpTooltip('error-code')"
                @click="showHelpTooltip('error-code')"
              >
                <span>Error code</span>
                <app-icon
                  variant="info_outline"
                  size="16"
                  no-margin
                  aria-hidden="true"
                />
              </button>
              <span
                v-if="activeHelpTooltip === 'error-code'"
                id="workspace-job-error-code-tooltip"
                class="workspace-job-failure-tooltip"
                role="tooltip"
              >
                A code that identifies the type of problem. You can share it with support.
              </span>
            </span>
          </dt>
          <dd>{{ job.response?.messageCode ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>
            <span class="workspace-job-failure-help-wrapper">
              <button
                class="workspace-job-failure-help"
                type="button"
                aria-label="Job type. Show explanation."
                :aria-describedby="activeHelpTooltip === 'job-type' ? 'workspace-job-type-tooltip' : undefined"
                @pointerenter="showHelpTooltip('job-type')"
                @pointerleave="hideHelpTooltip('job-type')"
                @focus="showHelpTooltip('job-type')"
                @blur="hideHelpTooltip('job-type')"
                @click="showHelpTooltip('job-type')"
              >
                <span>Job type</span>
                <app-icon
                  variant="info_outline"
                  size="16"
                  no-margin
                  aria-hidden="true"
                />
              </button>
              <span
                v-if="activeHelpTooltip === 'job-type'"
                id="workspace-job-type-tooltip"
                class="workspace-job-failure-tooltip"
                role="tooltip"
              >
                The background task the system was performing when the problem occurred.
              </span>
            </span>
          </dt>
          <dd>{{ job.job_type }}</dd>
        </div>
        <div>
          <dt>
            <span class="workspace-job-failure-help-wrapper">
              <button
                class="workspace-job-failure-help"
                type="button"
                aria-label="Job ID. Show explanation."
                :aria-describedby="activeHelpTooltip === 'job-id' ? 'workspace-job-id-tooltip' : undefined"
                @pointerenter="showHelpTooltip('job-id')"
                @pointerleave="hideHelpTooltip('job-id')"
                @focus="showHelpTooltip('job-id')"
                @blur="hideHelpTooltip('job-id')"
                @click="showHelpTooltip('job-id')"
              >
                <span>Job ID</span>
                <app-icon
                  variant="info_outline"
                  size="16"
                  no-margin
                  aria-hidden="true"
                />
              </button>
              <span
                v-if="activeHelpTooltip === 'job-id'"
                id="workspace-job-id-tooltip"
                class="workspace-job-failure-tooltip"
                role="tooltip"
              >
                A unique reference for this setup attempt. Support can use it to investigate.
              </span>
            </span>
          </dt>
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

type HelpTooltipId = 'failed-step' | 'error-code' | 'job-type' | 'job-id';

const modal = useTemplateRef<ComponentExposed<typeof BModal>>('modal');
const loading = ref(false);
const job = ref<WorkspaceJob | null>(null);
const errorMessage = ref('');
const activeHelpTooltip = ref<HelpTooltipId | null>(null);
let requestId = 0;

defineExpose({ show });

async function show(workspaceId: WorkspaceId): Promise<void> {
  const activeRequestId = ++requestId;
  job.value = null;
  errorMessage.value = '';
  activeHelpTooltip.value = null;
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

function showHelpTooltip(tooltipId: HelpTooltipId): void {
  activeHelpTooltip.value = tooltipId;
}

function hideHelpTooltip(tooltipId: HelpTooltipId): void {
  if (activeHelpTooltip.value === tooltipId) {
    activeHelpTooltip.value = null;
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

.workspace-job-failure-help-wrapper {
  position: relative;
  display: inline-flex;
}

.workspace-job-failure-help {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 1.5rem;
  padding: 0;
  font: inherit;
  text-align: left;
  color: $text-secondary;
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: help;
}

.workspace-job-failure-help:hover {
  color: $text-navy;
}

.workspace-job-failure-help:focus-visible {
  color: $text-navy;
  outline: 0.125rem solid $primary;
  outline-offset: 0.125rem;
}

.workspace-job-failure-tooltip {
  position: absolute;
  z-index: $zindex-tooltip;
  bottom: calc(100% + 0.4rem);
  left: 0;
  width: max-content;
  max-width: min(16rem, calc(100vw - 2rem));
  padding: 0.35rem 0.5rem;
  color: $text-tooltip;
  background: $surface-tooltip;
  border-radius: $border-radius;
  box-shadow: $box-shadow-sm;
  font-size: 0.75rem;
  font-weight: $font-weight-normal;
  line-height: 1.4;
  white-space: normal;
}

.workspace-job-failure-tooltip::after {
  position: absolute;
  top: 100%;
  left: 0.75rem;
  border: 0.3rem solid transparent;
  border-top-color: $surface-tooltip;
  content: "";
}

.workspace-job-failure-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
