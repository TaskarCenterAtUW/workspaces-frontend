<template>
  <div
    ref="oswEditorContainer"
    class="editor-container"
  />
</template>

<script setup lang="ts">
import { rapidManager } from '~/services/index'

const route = useRoute()
const workspaceId = route.params.id
const oswEditorContainer = ref(null)

function onRapidLoaded() {
  oswEditorContainer.value.appendChild(rapidManager.containerNode)
  rapidManager.init(workspaceId)
}

onMounted(() => {
  if (!rapidManager.loaded.value) {
    watch(rapidManager.loaded, (val) => {
      if (val) {
        onRapidLoaded()
      }
    })

    rapidManager.load()
  }
  else {
    oswEditorContainer.value.appendChild(rapidManager.containerNode)
    rapidManager.switchWorkspace(workspaceId)
  }
})
</script>
