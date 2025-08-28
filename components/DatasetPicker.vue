<template>
    <input type="text" v-model="searchText" placeholder="Start typing a dataset name to filter datasets..." aria-label="Dataset Filter" class="form-control" />
    <select
      v-model="model"
      class="dataset-picker form-select"
      aria-label="Dataset Selection"
    >
      <option :selected value=null disabled>Select a (matching) dataset...</option>
      <option v-for="ds in datasets" :key="ds.id" :value="ds.id" >
        {{ ds.name }} (version {{ ds.version }})
      </option>
    </select>
</template>

<script setup lang="ts">
  import { tdeiClient } from '~/services/index'
  
  const model = defineModel({ required: true });
  const props = defineProps({
    projectGroupId: {
        type: String,
        required: true
    }
  });

  const { projectGroupId } = toRefs(props);
  const searchText = ref('');
  const datasets = ref([]);
  refreshDatasets(projectGroupId.value, searchText.value);

  watch(projectGroupId, (val) => refreshDatasets(val, searchText.value));
  watch(searchText, (val) => refreshDatasets(projectGroupId.value, val));

  async function refreshDatasets(projectGroupId: string, name: string) {
    datasets.value = (await tdeiClient.getDatasetsByProjectGroupAndName(projectGroupId, name))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (datasets.value.length === 0) {
        model.value = null;
    }
  }
</script>
  