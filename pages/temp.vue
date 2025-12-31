<template>
  <app-page>
    <form @submit="submit">
      <textarea v-model="inputOsmXml"></textarea>
      <button type="submit">Upload</button>
    </form>
  </app-page>
</template>

<script setup lang="ts">
import { osmClient } from '~/services/index';
import { osm2osc } from '~/services/osm';

const inputOsmXml = ref('');

async function submit(e:Event) {
  e.preventDefault();

  const workspaceId = 101
  const changesetId = await osmClient.createChangeset(workspaceId);
  const changesetXml = osm2osc(changesetId, inputOsmXml.value);
  await osmClient.uploadChangeset(workspaceId, changesetId, changesetXml);
}
</script>
