// Test outline
// @test e2e: loading this page successfully loads the Rapid editor with the workspace data, and shows the editor UI (playwright snapshot this)
// @test e2e: loading this page with each. value of the "editor" query param (e.g. rapid vs rapid3) loads the correct editor version (playwright snapshot each version's UI)
// @test e2e: loading this page with the "osw" datatype query param loads the OpenSidewalks editor, and without it loads the Pathways editor (playwright snapshot each editor's UI)
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)

<template>
  <div class="editorWrapper">
    <div
      ref="editorContainer"
      class="editorContainer"
      :class="{ rapid3: isRapid3 }"
    />
    <edit-conflation-control
      v-if="conflation"
      :service="conflation"
      :map="rapid3Manager?.rapidContext?.systems?.map"
    />
  </div>
</template>

<script setup lang="ts">
import { pathwaysManager, rapidManager, rapid3Manager } from '~/services/index';

const route = useRoute();
const workspaceId = Number(route.params.id);
const datatype = route.query.datatype;
const editor = route.query.editor;
const editorContainer = ref<HTMLDivElement | null>(null);

const oswManager = (editor === 'rapid3' && rapid3Manager) ? rapid3Manager : rapidManager
const manager = datatype === 'osw' ? oswManager : pathwaysManager
const isRapid3 = manager === rapid3Manager;

/** The TDEI conflation service, once Rapid 3 has started on an OSW workspace. */
const conflation = shallowRef<any>(null);
function findConflation() {
  conflation.value = isRapid3 && datatype === 'osw' ? rapid3Manager?.conflation ?? null : null;
}

function onEditorLoaded() {
  editorContainer.value!.appendChild(manager.containerNode);
  Promise.resolve(manager.init(workspaceId)).then(findConflation);
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
    editorContainer.value!.appendChild(manager.containerNode);
    Promise.resolve(manager.switchWorkspace(workspaceId)).then(findConflation);
  }
});
</script>

<style>
.editorWrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.editorContainer {
  width: 100%;
  height: 100%;
}

/* override some things that bootstrap / reset.scss did */
.editorContainer .modal {
  height: unset;
}
.editorContainer kbd {
  color: unset;
}

/* Remove extra language about OpenStreetMap (Rapid 3 only; the l10n overrides
   in services/rapid3.ts cover the rest) */
/* view on openstreetmap.org: feature inspector */
.editorContainer.rapid3 .inspector-wrap .sidebar-footer,
/* view on openstreetmap.org / report a note: note editor */
.editorContainer.rapid3 .body:has(.note-editor) ~ .sidebar-footer,
/* your changes will be visible on maps that use OpenStreetMap */
.editorContainer.rapid3 .save-section .commit-info,
/* your changes should appear on OpenStreetMap within a few minutes */
.editorContainer.rapid3 .save-summary > p,
/* Like OpenStreetMap? Connect with others */
.editorContainer.rapid3 .save-communityLinks {
  display: none;
}
</style>
