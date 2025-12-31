<template>
  <select
    v-model="model"
    class="project-group-picker form-select"
    aria-label="Project Group Selection"
  >
    <option
      v-for="pg in projectGroups"
      :key="pg.id"
      :value="pg.id"
    >
      {{ pg.name }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { tdeiUserClient } from '~/services/index'

const model = defineModel({ required: true })
const projectGroups = (await tdeiUserClient.getMyProjectGroups())
  .sort((a, b) => a.name.localeCompare(b.name))

if (projectGroups.length > 0) {
  if (!model.value || !projectGroups.some(pg => pg.id === model.value)) {
    model.value = projectGroups[0].id
  }
}
</script>
