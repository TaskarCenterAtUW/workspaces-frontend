<template>
  <form
    class="card mb-4"
    @submit.prevent="saveExternalAppConfiguration"
  >
    <div class="card-body border-bottom">
      <h3 class="card-title mb-3">
        External Apps
      </h3>

      <div class="form-check form-switch">
        <label class="form-check-label">
          <input
            v-model="workspace.externalAppAccess"
            type="checkbox"
            class="form-check-input"
            :true-value="1"
            :false-value="0"
          >
          Publish this workspace for external apps
        </label>
      </div>

      <hr>

      <h4 class="h5">
        AVIV ScoutRoute Long Form Quest Definitions
      </h4>

      <div class="form-check">
        <label class="form-check-label">
          Define quests in Workspaces
          <input
            v-model="longFormQuestType"
            class="form-check-input"
            type="radio"
            name="longFormQuestType"
            value="JSON"
          >
        </label>
      </div>
      <div class="form-check">
        <label class="form-check-label">
          Load quest definitions from an external URL
          <input
            v-model="longFormQuestType"
            class="form-check-input"
            type="radio"
            name="longFormQuestType"
            value="URL"
          >
        </label>
      </div>

      <template v-if="longFormQuestType === 'JSON'">
        <label class="d-block form-label mt-3">
          JSON Quest Definition
          <textarea
            v-model.trim="longFormQuestDef"
            class="form-control"
            :class="{ 'drag-over': isDraggingQuest }"
            rows="5"
            placeholder="Optional"
            @dragover.prevent="isDraggingQuest = true"
            @dragleave.prevent="isDraggingQuest = false"
            @drop.prevent="onQuestFileDrop"
          />
        </label>
        <div
          id="imagery-help"
          class="form-text"
        >
          Paste the JSON content directly or drag and drop a JSON file.
          See the
          <a
            :href="longFormQuestSchemaUrl"
            target="_blank"
          >
            JSON Schema
          </a>
          for the required format and an
          <a
            :href="longFormQuestExampleUrl"
            target="_blank"
          >
            example
          </a>.
        </div>
      </template>

      <template v-else-if="longFormQuestType === 'URL'">
        <label class="d-block form-label mt-3">
          Quest Definition URL
          <input
            v-model.trim="longFormQuestUrl"
            type="text"
            class="form-control"
            placeholder="https://..."
          >
        </label>
        <div
          id="imagery-help"
          class="form-text"
        >
          Enter the address of a quest definition JSON document
          See the
          <a
            :href="longFormQuestSchemaUrl"
            target="_blank"
          >
            JSON Schema
          </a>
          for the required format and an
          <a
            :href="longFormQuestExampleUrl"
            target="_blank"
          >
            example
          </a>.
        </div>
      </template>

      <div
        v-if="longFormQuestError"
        class="form-text text-danger"
      >
        {{ longFormQuestError }}
      </div>

      <hr>
      <button
        type="submit"
        class="btn btn-primary"
      >
        Save
      </button>
      <div
        v-if="externalAppSaveStatus"
        :class="`mt-2 form-text text-${
          externalAppSaveStatus.type === 'success' ? 'success' : 'danger'
        }`"
      >
        {{ externalAppSaveStatus.message }}
      </div>
    </div><!-- .card-body -->
  </form><!-- .card -->
</template>

<script setup lang="ts">
import { workspacesClient } from '~/services/index';
import { handleFileDrop, validateJson } from '~/util/schema';
import { isHttpUrl, normalizeUrl } from '~/util/url';

import type { Workspace } from '~/types/workspaces';

const longFormQuestSchemaUrl = import.meta.env.VITE_LONG_FORM_QUEST_SCHEMA;
const longFormQuestExampleUrl = import.meta.env.VITE_LONG_FORM_QUEST_EXAMPLE_URL;

const workspace = inject<Workspace>('workspace')!;

const [longFormQuestSettings] = await Promise.all([
  workspacesClient.getLongFormQuestSettings(workspace.id),
]);

const longFormQuestSchema = ref<object | undefined>();
const longFormQuestType = ref(longFormQuestSettings.type);
const longFormQuestDef = ref(longFormQuestSettings.definition);
const longFormQuestUrl = ref(longFormQuestSettings.url);
const longFormQuestError = ref<string | null>(null);
const externalAppSaveStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null);
const isDraggingQuest = ref(false);

watch(
  [
    longFormQuestType,
    longFormQuestDef,
    longFormQuestUrl,
    () => workspace.externalAppAccess,
  ],
  () => { clearExternalAppMessages(); },
);

function clearExternalAppMessages() {
  longFormQuestError.value = null;
  externalAppSaveStatus.value = null;
}

function onQuestFileDrop(event: DragEvent) {
  handleFileDrop(event, longFormQuestDef, isDraggingQuest);
}

async function saveExternalAppConfiguration() {
  clearExternalAppMessages();

  let type = longFormQuestType.value;
  let definition = longFormQuestDef.value;
  let url = longFormQuestUrl.value;

  if (type === 'JSON') {
    url = undefined;

    if (!definition) {
      type = 'NONE';
    }
    else {
      const validationResult = await validateJson(
        definition,
        longFormQuestSchemaUrl,
        longFormQuestSchema,
        'Long form quest definition',
      );

      if (validationResult.error) {
        longFormQuestError.value = validationResult.error;
        return;
      }
    }
  }
  else if (type === 'URL') {
    definition = undefined;

    if (!url) {
      type = 'NONE';
    }
    else if (!isHttpUrl(url)) {
      longFormQuestError.value = 'The URL is not valid.';
      return;
    }
    else {
      url = normalizeUrl(url);
    }
  }

  try {
    await Promise.all([
      workspacesClient.updateWorkspace(workspace.id, {
        externalAppAccess: workspace.externalAppAccess,
      }),
      workspacesClient.saveLongFormQuestSettings(workspace.id, {
        type,
        definition,
        url,
      }),
    ]);

    externalAppSaveStatus.value = { type: 'success', message: 'Changes saved.' };
    longFormQuestType.value = type;
    longFormQuestDef.value = definition;
    longFormQuestUrl.value = url;
  }
  catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'unexpected error';
    externalAppSaveStatus.value = {
      type: 'error',
      message: 'Failed to save changes: ' + errorMessage,
    };
  }
}
</script>
