<template>
  <div class="table-responsive border-top mb-0">
    <table class="table table-striped">
      <tbody>
        <tr>
          <th><app-icon variant="schedule" />Created At</th>
          <td>{{ workspace.createdAt?.toLocaleString() }}</td>
        </tr>
        <tr>
          <th><app-icon variant="person_outline" />Created By</th>
          <td>{{ workspace.createdByName }}</td>
        </tr>
        <tr>
          <th><app-icon variant="badge" />My Role</th>
          <td>
            <span
              v-if="workspace.role === 'lead'"
              class="badge bg-dark text-uppercase"
            >
              <app-icon variant="star" /> Owner
            </span>
            <span
              v-else-if="workspace.role === 'validator'"
              class="badge bg-dark text-uppercase"
            >
              <app-icon variant="task_alt" /> Validator
            </span>
            <span
              v-else
              class="badge bg-secondary text-uppercase"
            >
              <app-icon variant="person" /> Member
            </span>
            <span
              v-if="isPoc"
              class="badge bg-warning text-dark text-uppercase ms-1"
            >
              <app-icon variant="local_police" /> POC
            </span>
            <span
              v-else-if="isDataGenerator"
              class="badge bg-warning text-dark text-uppercase ms-1"
            >
              <app-icon variant="offline_bolt" /> Data Generator
            </span>
          </td>
        </tr>
        <tr>
          <th><app-icon variant="phonelink_setup" />App Access</th>
          <td>
            <span
              v-if="workspace.externalAppAccess === 0"
              class="badge bg-secondary text-uppercase"
            >
              Disabled
            </span>
            <span
              v-else-if="workspace.externalAppAccess === 1"
              class="badge bg-success text-uppercase"
            >
              Public
            </span>
            <span
              v-else-if="workspace.externalAppAccess === 2"
              class="badge bg-success text-uppercase"
            >
              Project Group Only
            </span>
          </td>
        </tr>
        <tr>
          <th><app-icon variant="dataset" />From TDEI Dataset ID</th>
          <td>{{ workspace.tdeiRecordId ?? 'N/A' }}</td>
        </tr>
        <tr>
          <th><app-icon variant="group_work" />TDEI Project Group ID</th>
          <td>{{ workspace.tdeiProjectGroupId }}</td>
        </tr>
        <tr>
          <th><app-icon variant="update" />TDEI Dataset Version</th>
          <td>{{ workspace.tdeiMetadata?.metadata?.dataset_detail?.version ?? "N/A" }}</td>
        </tr>
      </tbody>
    </table>
  </div><!-- .table-responsive -->
</template>

<script setup lang="ts">
import type { Workspace } from '~/types/workspaces';

interface Props {
  workspace: Workspace;
  myTdeiRoles: string[];
}

const props = defineProps<Props>();

const isPoc = computed(() => props.myTdeiRoles.includes('poc'));
const isDataGenerator = computed(() =>
  props.myTdeiRoles.includes(`${props.workspace.type}_data_generator`),
);
</script>

<style lang="scss">
.dashboard-page {
  table th {
    white-space: nowrap;
  }
}
</style>
