// Test outline
// @test e2e: loading this page successfully loads the Rapid editor with the workspace data, and shows the editor UI (playwright snapshot this)
// @test e2e: loading this page with each. value of the "editor" query param (e.g. rapid vs rapid3) loads the correct editor version (playwright snapshot each version's UI)
// @test e2e: loading this page with the "osw" datatype query param loads the OpenSidewalks editor, and without it loads the Pathways editor (playwright snapshot each editor's UI)
// @test e2e: loading this page with editor=rapid3 and a non-osw datatype (e.g. pathways) loads Rapid 3 instead of the Pathways editor (playwright snapshot this)
// @test e2e: loading Rapid 3 for a pathways workspace swaps in the GTFS Pathways presets; loading it for an osw workspace keeps the OSM presets
// @test e2e: Rapid 3 on a pathways workspace shows a level panel next to the editor; other editors and datatypes don't
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)

<template>
  <div class="edit-page">
    <div
      ref="editorContainer"
      class="editorContainer"
      :class="{ rapid3: isRapid3 }"
    />
    <edit-pathways-level-panel
      v-if="levelTools"
      :tools="levelTools"
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

// editor=rapid3 opens Rapid 3 for any datatype; otherwise OSW uses Rapid 2 and
// everything else uses the Pathways editor.
const manager = (editor === 'rapid3' && rapid3Manager)
  ? rapid3Manager
  : (datatype === 'osw' ? rapidManager : pathwaysManager);
const isRapid3 = manager === rapid3Manager;

// GTFS level tools, available once Rapid 3 has started on a pathways workspace.
const levelTools = computed(() => (isRapid3 ? rapid3Manager?.levelTools.value : undefined));

function onEditorLoaded() {
  editorContainer.value!.appendChild(manager.containerNode);
  if (manager === rapid3Manager) {
    rapid3Manager.init(workspaceId, datatype as string | undefined);
  } else {
    manager.init(workspaceId);
  }
}

onMounted(() => {
  // If a different Rapid version is already loaded, hard-reload to swap.
  // Only one version can occupy the global Rapid namespace at a time.
  if (manager !== pathwaysManager) {
    const otherManager = manager === rapidManager ? rapid3Manager : rapidManager
    if (otherManager?.loaded.value) {
      window.location.reload()
      return
    }
  }

  // Rapid 3's schema customizations are per-datatype and can't be undone, so a
  // Rapid 3 instance set up for one datatype can't be reused for another.
  if (manager === rapid3Manager && manager.loaded.value && rapid3Manager.datatype !== datatype) {
    window.location.reload();
    return;
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
    manager.switchWorkspace(workspaceId);
  }
});
</script>

<style>
.edit-page {
  display: flex;
  width: 100%;
  height: 100%;
}

.editorContainer {
  flex: 1;
  min-width: 0;
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

/* Labels for coded GTFS tag values in Rapid 3's tag editor (services/rapid3-tag-labels.ts) */
.editorContainer.rapid3 .tag-row .value-wrap {
  position: relative;
}
.editorContainer.rapid3 .tag-row .gtfs-value-label {
  position: absolute;
  top: 50%;
  right: 0.5em;
  transform: translateY(-50%);
  max-width: 60%;
  overflow: hidden;
  font-size: 0.85em;
  opacity: 0.6;
  pointer-events: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The dropdown may be attached outside the editor container, so this isn't scoped to it. */
.combobox-option .gtfs-value-option-label {
  margin-left: 0.5em;
  opacity: 0.6;
}
</style>
