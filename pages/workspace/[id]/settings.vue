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
              <input v-model.trim="workspaceName" class="form-control" />
            </label>

            <button type="submit" class="btn btn-primary">Rename</button>
          </form>
        </div>
        <!-- .card-body -->
      </div>
      <!-- .card -->

      <div class="card mb-4">
        <div class="card-body">
          <h3 class="card-title mb-3">External Apps</h3>

          <div class="form-check form-switch mb-3">
            <label class="form-check-label">
              <input
                v-model="workspace.externalAppAccess"
                type="checkbox"
                class="form-check-input"
                :true-value="1"
                :false-value="0"
              />
              Publish this workspace for external apps (change will take effect
              immediately)
            </label>
          </div>

          <form @submit.prevent="saveExternalAppConfigurations">
            <label class="d-block form-label mb-3">
              AVIV ScoutRoute Long Form Quest JSON Definition
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
              <div id="imagery-help" class="form-text">
                Paste the JSON content directly or drag and drop a JSON file.
                See the
                <a :href="longFormQuestSchemaUrl" target="_blank" rel="noopener"
                  >JSON Schema</a
                >
                for the required format and an
                <a
                  :href="longFormQuestExampleUrl"
                  target="_blank"
                  rel="noopener"
                  >example</a
                >.
              </div>
            </label>

            <label class="d-block form-label mb-3">
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
                <a :href="imagerySchemaUrl" target="_blank" rel="noopener"
                  >JSON Schema</a
                >
                for the required format and an
                <a :href="imageryExampleUrl" target="_blank" rel="noopener"
                  >example</a
                >.
              </div>
            </label>

            <button type="submit" class="btn btn-primary">Save</button>
          </form>
        </div>
        <!-- .card-body -->
      </div>
      <!-- .card -->

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
              <strong
                >To confirm, please type "delete" in the box below:</strong
              >
              <input
                ref="deleteAttestationInput"
                v-model.trim="deleteAttestation"
                class="form-control border-danger"
              />
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
import type { Ref } from "vue";
import { toast } from "vue3-toastify";
import "vue3-toastify/dist/index.css";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const route = useRoute();
const workspaceId = route.params.id;
const [workspace, longFormQuestJson] = await Promise.all([
  workspacesClient.getWorkspace(workspaceId),
  workspacesClient.getLongFormQuestDefinition(workspaceId),
]);

const workspaceName = ref(workspace.title);
const longFormQuestDef = ref(longFormQuestJson);
let imageryListDefInit: string;
if (Array.isArray(workspace.imageryList)) {
  imageryListDefInit = JSON.stringify(workspace.imageryList, null, 2);
} else if (typeof workspace.imageryList === "string") {
  imageryListDefInit = workspace.imageryList;
} else {
  imageryListDefInit = "[]";
}
const imageryListDef = ref(imageryListDefInit);

const deleteAccepted = ref(false);
const deleteAttestation = ref("");
const deleteAttestationInput = ref(null);
const isDraggingImagery = ref(false);
const isDraggingQuest = ref(false);

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

async function toggleExternalAppAccess() {
  try {
    await save({ externalAppAccess: workspace.externalAppAccess });
  } catch (e) {
    toast.error("External app enable/disable failed:" + e.message);
    return;
  }
  toast.success("External app enable/disable set successfully.");
}

const imagerySchemaUrl = import.meta.env.VITE_IMAGERY_SCHEMA;
const imageryExampleUrl = import.meta.env.VITE_IMAGERY_EXAMPLE_URL;
const longFormQuestSchemaUrl = import.meta.env.VITE_LONG_FORM_QUEST_SCHEMA;
const longFormQuestExampleUrl = import.meta.env
  .VITE_LONG_FORM_QUEST_EXAMPLE_URL;

const imagerySchema: Ref<any> = ref(null);
const longFormQuestSchema: Ref<any> = ref(null);

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
): Promise<any | undefined> {
  if (!jsonString) {
    return null;
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
      toast.error(`${definitionName} is not valid JSON: ${e.message}`);
      return undefined;
    }

    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(cachedSchema.value);
    const valid = validate(parsedJson);
    if (!valid) {
      toast.error(
        `${definitionName} JSON is not valid: ${ajv.errorsText(
          validate.errors
        )}`
      );
      return undefined;
    }

    return parsedJson;
  } catch (e: any) {
    toast.error(
      `Failed to validate ${definitionName.toLowerCase()}: ${e.message}`
    );
    return undefined;
  }
}

async function saveExternalAppConfigurations() {
  const parsedImageryJson = await validateJson(
    imageryListDef.value,
    imagerySchemaUrl,
    imagerySchema,
    "Imagery definition"
  );
  if (parsedImageryJson === undefined) return;

  const parsedLongFormQuestJson = await validateJson(
    longFormQuestDef.value,
    longFormQuestSchemaUrl,
    longFormQuestSchema,
    "Long form quest definition"
  );
  if (parsedLongFormQuestJson === undefined) return;

  try {
    await save({
      imageryListDef: parsedImageryJson,
      longFormQuestDef: parsedLongFormQuestJson,
      externalAppAccess: workspace.externalAppAccess,
    });
    toast.success("Changes saved.");
  } catch (e) {
    toast.error("Failed to save changes: " + e.message);
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
