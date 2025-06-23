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
  import { tdeiUserClient } from '~/services/index'
  
  const model = defineModel({ required: true });
  const props = defineProps({
    projectGroupId: {
        type: String
    },
    tdeiRecordId: {
        type: String
    }
  });

  const { projectGroupId, tdeiRecordId } = toRefs(props);
  const datasets = ref([]);

  watch(projectGroupId, (val) => refreshDatasets());

  async function refreshDatasets() {
    datasets.value = (await tdeiUserClient.getDatasetsByProjectGroup(props.projectGroupId))
        .sort((a, b) => a.name.localeCompare(b.name));
    
    if (!model.value && datasets.length > 0) {
      model.value = datasets[0].id
    }
  }
</script>
  