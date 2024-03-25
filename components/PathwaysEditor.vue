<template>
  <div ref="pathwaysEditorContainer" class="editor-container"></div>
</template>

<script setup lang="ts">
import { pathwaysManager } from '~/services/index';

const route = useRoute();
const workspaceId = route.params.id;
const pathwaysEditorContainer = ref(null);

function onRapidLoaded() {
  pathwaysEditorContainer.value.appendChild(pathwaysManager.containerNode);
  pathwaysManager.init(workspaceId);
}

onMounted(() => {
  if (!pathwaysManager.loaded.value) {
    watch(pathwaysManager.loaded, (val) => {
      if (val) {
        onRapidLoaded();
      }
    });

    pathwaysManager.load();
  } else {
    pathwaysEditorContainer.value.appendChild(pathwaysManager.containerNode);
    pathwaysManager.switchWorkspace(workspaceId);
  }
});
</script>
