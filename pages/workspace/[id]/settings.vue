<template>
  <app-page>
    <h2 class="mb-5">Workspace Settings</h2>

    <div class="col-lg-8">
      <div class="card mb-4">
        <div class="card-body">
          <h3 class="card-title mb-3">General</h3>

          <form @submit.prevent="rename">
            <label class="d-block mb-3">
              Workspace Title
              <input v-model.trim="workspaceName" class="form-control" >
            </label>

            <button type="submit" class="btn btn-primary">Rename</button>
          </form>
        </div>
        <!-- .card-body -->
      </div>
      <!-- .card -->

      <form class="card mb-4" @submit.prevent="saveExternalAppConfiguration">
        <div class="card-body border-bottom">
          <h3 class="card-title mb-3">External Apps</h3>

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

          <h4 class="h5">AVIV ScoutRoute Long Form Quest Definitions</h4>

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
            <div id="imagery-help" class="form-text">
              Paste the JSON content directly or drag and drop a JSON file.
              See the
              <a :href="longFormQuestSchemaUrl" target="_blank">JSON Schema</a>
              for the required format and an
              <a :href="longFormQuestExampleUrl" target="_blank">example</a>.
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
            <div id="imagery-help" class="form-text">
              Enter the address of a quest definition JSON document
              See the
              <a :href="longFormQuestSchemaUrl" target="_blank">JSON Schema</a>
              for the required format and an
              <a :href="longFormQuestExampleUrl" target="_blank">example</a>.
            </div>
          </template>

          <div v-if="longFormQuestError" class="form-text text-danger">
            {{ longFormQuestError }}
          </div>

          <hr>
          <button type="submit" class="btn btn-primary">Save</button>
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

      <form class="card mb-4" @submit.prevent="saveImageryConfiguration">
        <div class="card-body">
          <h3 class="card-title mb-3">Custom Imagery</h3>

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
            <div id="imagery-help" class="form-text">
              Paste the JSON content directly or drag and drop a JSON file.
              See the
              <a :href="imagerySchemaUrl" target="_blank">JSON Schema</a>
              for the required format and an
              <a :href="imageryExampleUrl" target="_blank">example</a>.
            </div>
            <div v-if="imageryError" class="form-text text-danger">
              {{ imageryError }}
            </div>
          </label>

          <button type="submit" class="btn btn-primary">Save</button>
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

      <div class="card mb-4 border-danger">
        <div class="card-body">
          <h3 class="card-title mb-3">Delete Workspace</h3>

          <p>
            Deleting a workspace is permanent. This action will not remove any
            TDEI datasets outside of Workspaces.
          </p>

          <button
            class="btn btn-outline-danger mb-3"
            :disabled="deleteAccepted"
            @click="acceptDelete"
          >
            I understand, and I want to delete this workspace
          </button>

          <template v-if="deleteAccepted">
            <label class="d-block mb-3">
              <strong>To confirm, please type "delete" in the box below:</strong>
              <input
                ref="deleteAttestationInput"
                v-model.trim="deleteAttestation"
                class="form-control border-danger"
              >
            </label>

            <button
              class="btn btn-danger"
              :disabled="deleteAttestation !== 'delete'"
              @click="submitDelete"
            >
              Delete this workspace
            </button>
          </template>
        </div>
        <!-- .card-body -->
      </div>
      <!-- .card -->
    </div>
    <!-- .col -->
  </app-page>
</template>

<script setup lang="ts">
import { LoadingContext } from "~/services/loading";
import { workspacesClient } from "~/services/index";
import { isHttpUrl, normalizeUrl } from '~/util/url';

import type { Ref } from "vue";
import { toast } from "vue3-toastify";
import "vue3-toastify/dist/index.css";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const route = useRoute();
const workspaceId = route.params.id;
const [workspace, longFormQuestSettings] = await Promise.all([
  workspacesClient.getWorkspace(workspaceId),
  workspacesClient.getLongFormQuestSettings(workspaceId)
]);

const workspaceName = ref(workspace.title);

const longFormQuestType = ref(longFormQuestSettings.type);
const longFormQuestDef = ref(longFormQuestSettings.definition);
const longFormQuestUrl = ref(longFormQuestSettings.url);
const longFormQuestError = ref<string | null>(null);
const externalAppSaveStatus = ref<{ type: "success" | "error"; message: string } | null>(null);
const isDraggingQuest = ref(false);

let imageryListDefInit: string = "";
if (Array.isArray(workspace.imageryListDef)) {
  imageryListDefInit = JSON.stringify(workspace.imageryListDef, null, 2);
}
const imageryListDef = ref(imageryListDefInit);
const imageryError = ref<string | null>(null);
const imagerySaveStatus = ref<{ type: "success" | "error"; message: string } | null>(null);
const isDraggingImagery = ref(false);

const deleteAccepted = ref(false);
const deleteAttestation = ref("");
const deleteAttestationInput = ref(null);

watch(
  [
    longFormQuestType,
    longFormQuestDef,
    longFormQuestUrl,
    () => workspace.externalAppAccess
  ],
  () => { clearExternalAppMessages(); }
);
watch(imageryListDef, () => { clearExternalAppMessages(); });

function clearExternalAppMessages() {
  longFormQuestError.value = null;
  externalAppSaveStatus.value = null;
}

function clearImageryMessages() {
  imageryError.value = null;
  externalAppSaveStatus.value = null;
}

async function save(details) {
  await workspacesClient.updateWorkspace(workspaceId, details);
}

async function rename() {
  try {
    await save({ title: workspaceName.value });
  } catch (e) {
    toast.error("Workspace rename failed:" + e.message);
    return;
  }
  toast.success("Workspace renamed successfully.");
}

const imagerySchemaUrl = import.meta.env.VITE_IMAGERY_SCHEMA;
const imageryExampleUrl = import.meta.env.VITE_IMAGERY_EXAMPLE_URL;
const longFormQuestSchemaUrl = import.meta.env.VITE_LONG_FORM_QUEST_SCHEMA;
const longFormQuestExampleUrl = import.meta.env.VITE_LONG_FORM_QUEST_EXAMPLE_URL;

const imagerySchema = ref<any>(null);
const longFormQuestSchema = ref<any>(null);

function handleFileDrop(
  event: DragEvent,
  targetRef: Ref<string>,
  isDraggingRef: Ref<boolean>
) {
  isDraggingRef.value = false;
  const files = event.dataTransfer?.files;
  if (files && files[0]) {
    const file = files[0];
    if (!file.type.includes("json") && !file.name.endsWith(".json")) {
      toast.error("Please drop a valid JSON file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === "string") {
        try {
          const parsed = JSON.parse(e.target.result);
          targetRef.value = JSON.stringify(parsed, null, 2);
          toast.success("JSON file loaded successfully.");
        } catch (err) {
          targetRef.value = e.target.result;
          toast.warn("The selected file is not valid JSON.");
        }
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read the file.");
    };
    reader.readAsText(file);
  }
}

function onImageryFileDrop(event: DragEvent) {
  handleFileDrop(event, imageryListDef, isDraggingImagery);
}

function onQuestFileDrop(event: DragEvent) {
  handleFileDrop(event, longFormQuestDef, isDraggingQuest);
}

async function validateJson(
  jsonString: string | undefined,
  schemaUrl: string,
  cachedSchema: Ref<any>,
  definitionName: string
): Promise<{ data: any | null; error: string | null }> {
  if (!jsonString) {
    return { data: null, error: null };
  }

  try {
    if (!cachedSchema.value) {
      const schemaResponse = await fetch(schemaUrl);
      if (!schemaResponse.ok) {
        throw new Error(
          `Could not fetch ${definitionName.toLowerCase()} schema: ${
            schemaResponse.statusText
          }`
        );
      }
      cachedSchema.value = await schemaResponse.json();
      // remove "version" from the schema if exists
      // we have version in long form quest schema which is creating problem while validating with json.
      if (cachedSchema.value.version) {
        delete cachedSchema.value.version;
      }
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch (e: any) {
      return {
        data: null,
        error: `${definitionName} is not valid JSON: ${e.message}`,
      };
    }

    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(cachedSchema.value);
    const valid = validate(parsedJson);
    if (!valid) {
      return {
        data: null,
        error: `${definitionName} JSON is not valid: ${ajv.errorsText(
          validate.errors
        )}`,
      };
    }

    return { data: parsedJson, error: null };
  } catch (e: any) {
    return {
      data: null,
      error: `Failed to validate ${definitionName.toLowerCase()}: ${e.message}`,
    };
  }
}

async function saveExternalAppConfiguration() {
  clearExternalAppMessages();

  let type = longFormQuestType.value;
  let definition = longFormQuestDef.value;
  let url = longFormQuestUrl.value;

  if (type === 'JSON') {
    url = null;

    if (!definition) {
      type = 'NONE'
    } else {
      const validationResult = await validateJson(
        definition,
        longFormQuestSchemaUrl,
        longFormQuestSchema,
        'Long form quest definition'
      );

      if (validationResult.error) {
        longFormQuestError.value = validationResult.error;
        return;
      }
    }
  } else if (type === 'URL') {
    definition = null;

    if (!url) {
      type = 'NONE'
    } else if (!isHttpUrl(url)) {
      longFormQuestError.value = 'The URL is not valid.';
      return;
    } else {
      url = normalizeUrl(url);
    }
  }

  try {
    await Promise.all([
      save({ externalAppAccess: workspace.externalAppAccess }),
      workspacesClient.saveLongFormQuestSettings(workspaceId, {
        type,
        definition,
        url
      })
    ]);

    externalAppSaveStatus.value = { type: 'success', message: 'Changes saved.' };
    longFormQuestType.value = type;
    longFormQuestDef.value = definition;
    longFormQuestUrl.value = url;
  } catch (e) {
    externalAppSaveStatus.value = {
      type: 'error',
      message: 'Failed to save changes: ' + e.message,
    };
  }
}

async function saveImageryConfiguration() {
  clearImageryMessages();

  const imageryResult = await validateJson(
    imageryListDef.value,
    imagerySchemaUrl,
    imagerySchema,
    "Imagery definition"
  );

  if (imageryResult.error) {
    imageryError.value = imageryResult.error;
    return;
  }

  try {
    // FIXME: make both the legacy and the new backend API calls to handle both cases until we
    // fully deprecate the old API.
    await save({ imageryListDef: imageryResult.data });
    workspacesClient.saveImageryDefSettings(workspaceId, { definition: imageryResult.data })
    
    imagerySaveStatus.value = { type: "success", message: "Changes saved." };
  } catch (e) {
    imagerySaveStatus.value = {
      type: "error",
      message: "Failed to save changes: " + e.message,
    };
  }
}

async function acceptDelete() {
  deleteAccepted.value = true;
  await nextTick();
  deleteAttestationInput.value.focus();
}

async function submitDelete() {
  await workspacesClient.deleteWorkspace(workspaceId);
  navigateTo("/dashboard");
}
</script>

<style scoped>
.drag-over {
  border-style: dashed;
  border-color: var(--bs-primary);
  background-color: var(--bs-light);
}
</style>
