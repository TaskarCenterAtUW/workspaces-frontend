<template>
  <div class="table-responsive border-top">
    <table class="table table-striped mb-0">
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
          <th><app-icon variant="phonelink_setup" />App Access</th>
          <td>
            <span v-if="workspace.externalAppAccess === 0" class="badge bg-secondary text-uppercase">
              Disabled
            </span>
            <span v-else-if="workspace.externalAppAccess === 1" class="badge bg-success text-uppercase">
              Public
            </span>
            <span v-else-if="workspace.externalAppAccess === 2" class="badge bg-success text-uppercase">
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
const props = defineProps({
  workspace: {
    type: Object,
    required: true
  }
});
</script>

<style lang="scss">
.dashboard-page {
  table th {
    white-space: nowrap;
  }
}
</style>
