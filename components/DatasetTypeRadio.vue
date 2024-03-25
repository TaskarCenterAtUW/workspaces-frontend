<template>
  <div class="btn-group">
    <input
      v-model="model"
      type="radio"
      id="radio_type_osw"
      name="radio_type"
      class="btn-check"
      autocomplete="off"
      value="osw"
    >
    <label class="btn btn-outline-primary" for="radio_type_osw">OpenSidewalks</label>

    <input
      v-model="model"
      type="radio"
      id="radio_type_pathways"
      name="radio_type"
      class="btn-check"
      autocomplete="off"
      value="pathways"
    >
    <label class="btn btn-outline-primary" for="radio_type_pathways">GTFS Pathways</label>
  </div>
</template>

<script setup lang="ts">
const model = defineModel({ required: true });
</script>
