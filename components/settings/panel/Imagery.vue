<template>
  <form
    class="card mb-4"
    @submit.prevent="saveImageryConfiguration"
  >
    <div class="card-body">
      <h3 class="card-title mb-3">
        Custom Imagery
      </h3>

      <b-alert
        v-if="!isLead"
        variant="info"
        show
        class="mb-3"
      >
        <app-icon variant="info" />
        Only workspace owners can change imagery settings.
      </b-alert>

      <label class="d-block form-label">
        Imagery JSON Definition
        <textarea
          v-model.trim="imageryListDef"
          class="form-control"
          :class="{ 'drag-over': isDraggingImagery }"
          rows="5"
          placeholder="Optional"
          :disabled="!isLead"
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
        :disabled="!isLead"
      >
        Save
      </button>
    </div><!-- .card-body -->
  </form><!-- .card -->
</template>

<script setup lang="ts">
import { workspacesClient } from '~/services/index';
import { handleFileDrop, validateJson } from '~/util/schema';
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

import type { Workspace } from '~/types/workspaces';

const workspace = inject<Workspace>('workspace')!;
const { isLead } = useWorkspaceRole();

const imagerySchemaUrl = import.meta.env.VITE_IMAGERY_SCHEMA;
const imageryExampleUrl = import.meta.env.VITE_IMAGERY_EXAMPLE_URL;

const imagerySchema = ref<object | undefined>();
const imageryListDef = ref('');
const imageryError = ref<string | null>(null);
const isDraggingImagery = ref(false);

onMounted(async () => {
  const settings = await workspacesClient.getImagerySettings(workspace.id);

  if (Array.isArray(settings.definition)) {
    imageryListDef.value = JSON.stringify(settings.definition, null, 2);
  }
});

function clearImageryMessages() {
  imageryError.value = null;
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
    await workspacesClient.saveImageryDefSettings(workspace.id, {
      definition: imageryResult.data,
    });
    toast.success('Changes saved.');
  }
  catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'unexpected error';
    toast.error('Failed to save changes: ' + errorMessage);
  }
}
</script>
