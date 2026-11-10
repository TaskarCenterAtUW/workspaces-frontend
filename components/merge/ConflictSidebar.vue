<template>
  <aside class="conflicts-sidebar">
    <merge-conflict-list
      v-model="selected"
      :conflicts="conflicts"
      :resolved="resolved"
    />

    <div class="sidebar-footer p-3 border-top d-flex gap-2">
      <b-button
        variant="outline-secondary"
        size="sm"
        :disabled="committing"
        @click="emit('cancel')"
      >
        Cancel
      </b-button>
      <b-button
        variant="primary"
        size="sm"
        class="ms-auto"
        :disabled="unresolvedCount > 0 || committing || !isLead"
        @click="emit('commit')"
      >
        <app-spinner
          v-if="committing"
          size="sm"
        />
        <template v-else>
          Commit Merge
          <app-icon
            variant="arrow_circle_right"
            no-margin
          />
        </template>
      </b-button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { MergeConflict } from '~/services/merge';

interface Props {
  conflicts: MergeConflict[];
  resolved: boolean[];
  unresolvedCount: number;
  committing: boolean;
  isLead: boolean;
}

defineProps<Props>();

const selected = defineModel<number>({ required: true });

const emit = defineEmits<{
  cancel: [];
  commit: [];
}>();
</script>

<style scoped lang="scss">
@import "assets/scss/theme.scss";

.conflicts-sidebar {
  flex: 0 0 280px;
  width: 280px;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  overflow-y: auto;

  :deep(.list-group) {
    flex: 1 1 0;
    overflow-y: auto;
  }

  .sidebar-footer {
    flex-shrink: 0;
  }
}
</style>
