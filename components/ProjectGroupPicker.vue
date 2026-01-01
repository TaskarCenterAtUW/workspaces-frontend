<template>
  <select
    v-model="model"
    class="project-group-picker form-select"
    aria-label="Project Group Selection"
  >
    <option
      v-for="pg in projectGroups"
      :key="pg.tdei_project_group_id"
      :value="pg.tdei_project_group_id"
    >
      {{ pg.name }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { tdeiUserClient } from '~/services/index';
import type { TdeiProjectGroupItem } from '~/types/tdei';
import { compareStringAsc } from '~/util/compare';

const model = defineModel<string | undefined>({ required: true });
const props = defineProps<{ options?: TdeiProjectGroupItem[] }>();

const fetchedGroups = ref<TdeiProjectGroupItem[]>([]);

if (!props.options) {
  try {
    fetchedGroups.value = (await tdeiUserClient.getMyProjectGroups()).sort(
      compareStringAsc(g => g.name),
    );
  }
  catch {
    fetchedGroups.value = [];
  }
}

const projectGroups = computed(() => props.options ?? fetchedGroups.value);

watch(
  projectGroups,
  (groups) => {
    if (groups.length > 0) {
      const pgId = model.value;

      if (!pgId || !groups.some(pg => pg.tdei_project_group_id === pgId)) {
        model.value = groups[0]?.tdei_project_group_id;
      }
    }
  },
  { immediate: true },
);
</script>
