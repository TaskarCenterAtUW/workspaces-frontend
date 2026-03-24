<template>
  <div
    ref="editorContainer"
    class="editorContainer"
  />
</template>

<script setup lang="ts">
import { pathwaysManager, rapidManager, rapid3Manager } from '~/services/index'

const route = useRoute()
const workspaceId = route.params.id
const datatype = route.query.datatype
const editor = route.query.editor
const editorContainer = ref(null)

const oswManager = (editor === 'rapid3' && rapid3Manager) ? rapid3Manager : rapidManager
const manager = datatype === 'osw' ? oswManager : pathwaysManager

function onEditorLoaded() {
  editorContainer.value.appendChild(manager.containerNode)
  manager.init(workspaceId)
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
        onEditorLoaded()
      }
    })

    manager.load()
  }
  else {
    editorContainer.value.appendChild(manager.containerNode)
    manager.switchWorkspace(workspaceId)
  }
})
</script>

<style>
.editorContainer {
  width: 100%;
  height: 100%;
}
</style>
