<template>
    <select
      v-model="model"
      class="dataset-picker form-select"
      aria-label="Dataset Selection"
    >
      <option v-for="ds in datasets" :key="ds.id" :value="ds.id">
        {{ ds.name }}
      </option>
    </select>
</template>

<script setup lang="ts">
  import { tdeiClient } from '~/services/index'
  
  const model = defineModel({ required: true });
  const props = defineProps({
    projectGroupId: {
        type: String
    }
  });

  const { projectGroupId } = toRefs(props);
  const datasets = ref([]);
  refreshDatasets(projectGroupId.value);

  watch(projectGroupId, (val) => refreshDatasets(val));

  async function refreshDatasets(id: string) {
    datasets.value = (await tdeiClient.getDatasetsByProjectGroup(id))
        .sort((a, b) => a.name.localeCompare(b.name));
    
    if (!model.value && datasets.value.length > 0) {
        model.value = datasets.value[0].id;
    }

    if (datasets.value.length === 0) {
        model.value = null;
    }
  }
</script>
  