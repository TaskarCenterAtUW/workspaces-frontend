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
import {  rapidManager, rapid3Manager } from '~/services/index';
import { shapeToCenter } from '~/util/geojson';
/* We are using this only for osw */
const route = useRoute();
const workspaceId = route.params.id;
const editor = route.query.editor;
const editorContainer = ref(null);
const sideBarText = ref('Loading editor...')

const oswManager = (editor === 'rapid3' && rapid3Manager) ? rapid3Manager : rapidManager
const manager = oswManager

function onEditorLoaded() {
  editorContainer.value.appendChild(manager.containerNode);
  manager.init(workspaceId);
  window.location.hash = generateInitialHash();
  
}

function generateInitialHash() {
  // Generate a hash that sets the map to a specific location and zoom level
  const taskGeometry = {
        "type": "Polygon",
        "coordinates": [
            [
                [
                    -122.53443309733495,
                    47.63306776814611
                ],
                [
                    -122.5394952127257,
                    47.63306776814611
                ],
                [
                    -122.53873949775893,
                    47.63518525116859
                ],
                [
                    -122.53443309733495,
                    47.635249751830294
                ],
                [
                    -122.53443309733495,
                    47.63306776814611
                ]
            ]
        ]
    };
  const center = shapeToCenter(taskGeometry);
  console.log('Center of task geometry:', center);
  const lat = center[0]; // Example latitude
  const lon = center[1]; // Example longitude
  const zoom = 17.00; // Example zoom level
  const taskGeometryFeature = {
    type: "Feature",
    geometry: taskGeometry,
    properties: {}
  };
  const taskGeometryString = JSON.stringify(taskGeometryFeature);
  const dataUrl = 'https://provisodevstorage.blob.core.windows.net/reports/abc.geojson'; //'data:application/geo+json,' + encodeURIComponent(taskGeometryString);

  return `#map=${zoom}/${lat}/${lon}&background=MAPNIK&data=${encodeURIComponent(dataUrl)}`;
}

onMounted(() => {
  // If a different Rapid version is already loaded, hard-reload to swap.
  // Only one version can occupy the global Rapid namespace at a time.
//   if (datatype === 'osw') {
    const otherManager = manager === rapidManager ? rapid3Manager : rapidManager
    if (otherManager?.loaded.value) {
      window.location.reload()
      return
    }
      // Clear the hash to avoid restoring state from a different editor
//   }
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
    // Get the location hash from the URL and pass it to the manager to restore the state
    // const locationHash = window.location.hash;
    // if (locationHash) {
    // //   manager.restoreStateFromHash(locationHash);
    // console.log('Current hash:', locationHash);
    // }
    
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
