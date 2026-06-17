// Test outline
// @test e2e: loading this page successfully loads the Rapid editor with the workspace data, and shows the editor UI (playwright snapshot this)
// @test e2e: loading this page with each. value of the "editor" query param (e.g. rapid vs rapid3) loads the correct editor version (playwright snapshot each version's UI)
// @test e2e: loading this page with the "osw" datatype query param loads the OpenSidewalks editor, and without it loads the Pathways editor (playwright snapshot each editor's UI)
// @test e2e: if the editor fails to load, an error message is shown (playwright snapshot this)
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)

<template>
  <div ref="editorContainer" class="editorContainer"></div>
</template>

<script setup lang="ts">
import { pathwaysManager, rapidManager, rapid3Manager } from '~/services/index';

const route = useRoute();
const workspaceId = route.params.id;
const datatype = route.query.datatype;
const editor = route.query.editor;
const editorContainer = ref(null);

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
