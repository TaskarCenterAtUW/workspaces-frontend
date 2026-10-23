<template>
  <b-alert
    :variant="unresolvedCount > 0 ? 'danger' : 'success'"
    show
    class="mb-0 rounded-0 border-top-0"
  >
    <template v-if="unresolvedCount > 0">
      <strong>{{ unresolvedCount }}</strong> of {{ total }} conflicts require resolution.
      Resolve all conflicts before committing the merge.
    </template>
    <template v-else>
      All conflicts resolved. Click <strong>Commit Merge</strong> to create the merged workspace.
    </template>
  </b-alert>

  <b-alert
    v-if="!isLead"
    variant="warning"
    show
    class="mb-0 rounded-0 border-top-0"
  >
    Only workspace owners can commit a merge. You can review the conflicts below.
  </b-alert>
</template>

<script setup lang="ts">
interface Props {
  unresolvedCount: number;
  total: number;
  isLead: boolean;
}

defineProps<Props>();
</script>
