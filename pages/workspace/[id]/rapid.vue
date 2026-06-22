<template>
    <div class="pageContainer">
  <div ref="editorContainer" class="rapidEditorContainer"></div>
  <div class="sidebar">
    <p class="text-center mt-3">{{ sideBarText }}</p>
    <p> Add the action items here based on the selected workspace and editor.</p>
  </div>
  </div>
   
</template>
<script setup lang="ts">
import { pathwaysManager, rapidManager, rapid3Manager } from '~/services/index';

const route = useRoute();
const workspaceId = route.params.id;
const datatype = route.query.datatype;
const editor = route.query.editor;
const editorContainer = ref(null);
const sideBarText = ref('Loading editor...')

const oswManager = (editor === 'rapid3' && rapid3Manager) ? rapid3Manager : rapidManager
const manager = datatype === 'osw' ? oswManager : pathwaysManager

function onEditorLoaded() {
  editorContainer.value.appendChild(manager.containerNode);
  manager.init(workspaceId);
  
}

onMounted(() => {
  // If a different Rapid version is already loaded, hard-reload to swap.
  // Only one version can occupy the global Rapid namespace at a time.
  if (datatype === 'osw') {
    const otherManager = manager === rapidManager ? rapid3Manager : rapidManager
    if (otherManager?.loaded.value) {
      window.location.reload()
      return
    }
  }
  rapidManager.onStateChange((changes) => {
     console.log('Rapid state changed:', changes);
     sideBarText.value = `Rapid state changed: ${JSON.stringify(changes)}`;
  });

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
.pageContainer{
    align-items: center;
    display: flex;
    flex-direction: row;
    height: 100%;
}
.rapidEditorContainer {
  width: 80%;
  height: 100%;
}
.sidebar {
  width: 20%;
  height: 100%;
}
</style>
