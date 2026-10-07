<template>
  <b-list-group flush>
    <b-list-group-item
      v-for="(conflict, i) in conflicts"
      :key="conflict.number"
      :active="modelValue === i"
      button
      class="conflict-item"
      @click="modelValue = i"
    >
      <div class="d-flex align-items-start gap-2">
        <app-icon
          :variant="resolved[i] ? 'check_circle' : 'error'"
          :class="resolved[i] ? 'text-success' : 'text-danger'"
          class="flex-shrink-0 mt-1"
        />
        <div class="flex-grow-1 overflow-hidden">
          <div class="fw-bold text-truncate">
            {{ conflict.type }} {{ conflict.elementId }}
          </div>
          <div class="mt-1 d-flex gap-1 flex-wrap">
            <b-badge
              v-if="conflict.kind !== 'both-modified'"
              variant="danger"
              class="text-uppercase"
            >
              deleted
            </b-badge>
            <b-badge
              v-if="conflict.geometryConflict"
              variant="warning"
              class="text-uppercase"
            >
              geometry
            </b-badge>
            <b-badge
              v-if="conflict.tagConflicts.length"
              variant="info"
              class="text-uppercase"
            >
              tags
            </b-badge>
          </div>
        </div>
      </div>
    </b-list-group-item>
  </b-list-group>
</template>

<script setup lang="ts">
import type { MergeConflict } from '~/services/merge';

interface Props {
  conflicts: MergeConflict[];
  resolved: boolean[];
}

defineProps<Props>();

const modelValue = defineModel<number>({ required: true });
</script>

<style scoped lang="scss">
.conflict-item {
  cursor: pointer;

  :deep(.badge) {
    font-size: 0.65em;
  }
}
</style>
