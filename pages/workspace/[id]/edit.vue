// Test outline
// @test e2e: loading this page successfully loads the Rapid editor with the workspace data, and shows the editor UI (playwright snapshot this)
// @test e2e: loading this page with each. value of the "editor" query param (e.g. rapid vs rapid3) loads the correct editor version (playwright snapshot each version's UI)
// @test e2e: loading this page with the "osw" datatype query param loads the OpenSidewalks editor, and without it loads the Pathways editor (playwright snapshot each editor's UI)
// @test e2e: loading this page with editor=rapid3 and a non-osw datatype (e.g. pathways) loads Rapid 3 instead of the Pathways editor (playwright snapshot this)
// @test e2e: loading Rapid 3 for a pathways workspace swaps in the GTFS Pathways presets; loading it for an osw workspace keeps the OSM presets
// @test e2e: Rapid 3 on a pathways workspace marks the editor as GTFS Pathways (hiding Rapid's generic Point/Line/Area/Relation presets, which GTFS has no equivalent for)
// @test e2e: Rapid 3 on a pathways workspace shows a level panel next to the editor; other editors and datatypes don't
// @test e2e: while the editor is loading, the page shows a loading spinner over the editor area; it goes away once the editor has started
// @test e2e: leaving this page and coming back while the editor is still starting shows the spinner again until it has started
// @test e2e: if the editor fails to start, the page says so in place of the spinner
// @test e2e: opening this page with no map location in the URL starts the editor at the extent of the workspace's data; a location in the URL is kept, and an empty workspace keeps the editor's default
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://api.workspaces-stage.sidewalks.washington.edu/openapi.json)

<template>
  <div class="edit-page">
    <div
      ref="editorContainer"
      class="editorContainer"
      :class="{ 'rapid3': isRapid3, 'gtfs-pathways': isRapid3 && datatype === 'pathways' }"
    />
    <div
      v-if="editorState !== 'ready'"
      class="editor-loading"
    >
      <template v-if="editorState === 'loading'">
        <app-spinner class="editor-loading-spinner" />
        Loading the editor…
      </template>
      <span
        v-else
        role="alert"
      >
        The editor couldn't start. Reload the page to try again.
      </span>
    </div>
    <edit-pathways-level-panel
      v-if="levelTools"
      :tools="levelTools"
    />
  </div>
</template>

<script setup lang="ts">
import { pathwaysManager, rapidManager, rapid3Manager, workspacesClient } from '~/services/index';
import { mapHash, viewForBbox } from '~/util/osm';

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

// Covers the editor until it has started; an editor that has already started
// opens straight away.
const starting = manager.loaded.value ? editorStarts.get(manager) : undefined;
const editorState = ref<'loading' | 'ready' | 'failed'>(
  manager.loaded.value && !starting ? 'ready' : 'loading'
);

function waitForStart(started: Promise<void>) {
  started.then(
    () => {
      editorState.value = 'ready';
    },
    (err) => {
      console.error('The editor failed to start:', err);
      editorState.value = 'failed';
    }
  );
}

if (starting) {
  waitForStart(starting);
}

function onEditorLoaded() {
  editorContainer.value!.appendChild(manager.containerNode);
  const started = (manager === rapid3Manager
    ? rapid3Manager.init(workspaceId, datatype as string | undefined)
    : manager.init(workspaceId)
  ).finally(() => editorStarts.delete(manager));
  editorStarts.set(manager, started);
  waitForStart(started);
}

// The URL holds the editor's location (Rapid keeps it updated as the map moves).
// Without one, put the workspace's extent there for the editor to start from.
async function startAtDataExtent() {
  if (window.location.hash.includes('map=')) {
    return;
  }

  try {
    const bbox = await workspacesClient.getWorkspaceBbox(workspaceId);
    if (bbox && editorContainer.value) {
      const { clientWidth: width, clientHeight: height } = editorContainer.value;
      const hash = mapHash(viewForBbox(bbox, { width, height }));
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
  }
  catch (err) {
    console.warn('Could not find the workspace extent to start the editor at:', err);
  }
}

onMounted(async () => {
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

  await startAtDataExtent();
  if (!editorContainer.value) {
    return; // left the page meanwhile
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

<script lang="ts">
// Each editor's start while it's still running, kept across visits to this page,
// so coming back before the editor has started waits for the same start.
const editorStarts = new Map<object, Promise<void>>();
</script>

<style>
.edit-page {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
}

/* Hides Rapid's half-built UI while it starts up */
.edit-page .editor-loading {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  background: var(--bs-body-bg);
}
.edit-page .editor-loading-spinner {
  width: 3rem;
  height: 3rem;
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
  right: calc(30px + 0.25em); /* clear Rapid's 30px-wide dropdown arrow (.combobox-caret) */
  transform: translateY(-50%);
  max-width: calc(100% - 30px - 2.5em); /* leave room for the code itself */
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
/* GTFS Pathways has no generic point, line, area or relation (e.g. a generic
   node is location_type=3), so hide Rapid's built-in fallback presets from the
   preset picker. Rapid always appends them and can't drop them from the schema;
   their list items are classed by preset ID. */
.editorContainer.gtfs-pathways .preset-list-item.preset-point,
.editorContainer.gtfs-pathways .preset-list-item.preset-line,
.editorContainer.gtfs-pathways .preset-list-item.preset-area,
.editorContainer.gtfs-pathways .preset-list-item.preset-relation {
  display: none;
}
</style>
