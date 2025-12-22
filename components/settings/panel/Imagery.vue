<template>
  <form
    class="card mb-4"
    @submit.prevent="saveImageryConfiguration"
  >
    <div class="card-body">
      <h3 class="card-title mb-3">
        Custom Imagery
      </h3>

      <label class="d-block form-label">
        Imagery JSON Definition
        <textarea
          v-model.trim="imageryListDef"
          class="form-control"
          :class="{ 'drag-over': isDraggingImagery }"
          rows="5"
          placeholder="Optional"
          @dragover.prevent="isDraggingImagery = true"
          @dragleave.prevent="isDraggingImagery = false"
          @drop.prevent="onImageryFileDrop"
        />
        <div
          id="imagery-help"
          class="form-text"
        >
          Paste the JSON content directly or drag and drop a JSON file.
          See the
          <a
            :href="imagerySchemaUrl"
            target="_blank"
          >
            JSON Schema
          </a>
          for the required format and an
          <a
            :href="imageryExampleUrl"
            target="_blank"
          >
            example
          </a>.
        </div>
        <div
          v-if="imageryError"
          class="form-text text-danger"
        >
          {{ imageryError }}
        </div>
      </label>

      <button
        type="submit"
        class="btn btn-primary"
      >
        Save
      </button>
      <div
        v-if="imagerySaveStatus"
        :class="`mt-2 form-text text-${
          imagerySaveStatus.type === 'success' ? 'success' : 'danger'
        }`"
      >
        {{ imagerySaveStatus.message }}
      </div>
    </div><!-- .card-body -->
  </form><!-- .card -->
</template>

<script setup lang="ts">
import { workspacesClient } from '~/services/index';
import { handleFileDrop, validateJson } from '~/util/schema';

import type { Workspace } from '~/types/workspaces';

const workspace = inject<Workspace>('workspace')!;

const imagerySchemaUrl = import.meta.env.VITE_IMAGERY_SCHEMA;
const imageryExampleUrl = import.meta.env.VITE_IMAGERY_EXAMPLE_URL;

let imageryListDefInit = '';

if (Array.isArray(workspace.imageryListDef)) {
  imageryListDefInit = JSON.stringify(workspace.imageryListDef, null, 2);
}

const imagerySchema = ref<object | undefined>();
const imageryListDef = ref(imageryListDefInit);
const imageryError = ref<string | null>(null);
const imagerySaveStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null);
const isDraggingImagery = ref(false);

function clearImageryMessages() {
  imageryError.value = null;
  imagerySaveStatus.value = null;
}

function onImageryFileDrop(event: DragEvent) {
  handleFileDrop(event, imageryListDef, isDraggingImagery);
}

async function saveImageryConfiguration() {
  clearImageryMessages();

  const imageryResult = await validateJson(
    imageryListDef.value,
    imagerySchemaUrl,
    imagerySchema,
    'Imagery definition',
  );

  if (imageryResult.error) {
    imageryError.value = imageryResult.error;
    return;
  }

  try {
    workspacesClient.updateWorkspace(workspace.id, {
      imageryListDef: imageryResult.data,
    });
    imagerySaveStatus.value = { type: 'success', message: 'Changes saved.' };
  }
  catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'unexpected error';
    imagerySaveStatus.value = {
      type: 'error',
      message: 'Failed to save changes: ' + errorMessage,
    };
  }
}
</script>
