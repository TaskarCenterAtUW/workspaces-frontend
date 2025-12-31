<template>
  <div ref="editorContainer" class="editorContainer"/>
</template>

<script setup lang="ts">
import { pathwaysManager, rapidManager } from '~/services/index';

const route = useRoute();
const workspaceId = route.params.id;
const datatype = route.query.datatype;
const editorContainer = ref(null);
const manager = datatype === 'osw' ? rapidManager : pathwaysManager;

function onEditorLoaded() {
  editorContainer.value.appendChild(manager.containerNode);
  manager.init(workspaceId);
}

onMounted(() => {
  if (!manager.loaded.value) {
    watch(manager.loaded, (val) => {
      if (val) {
        onEditorLoaded();
      }
    });

    manager.load();
  } else {
    editorContainer.value.appendChild(manager.containerNode);
    manager.switchWorkspace(workspaceId);
  }
});
</script>

<style>
.editorContainer {
  width: 100%;
  height: 100%;
}
</style>
