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
        </div><!-- .card-body -->
      </div><!-- .card -->

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
              >
              Publish this workspace for external apps (change will take effect immediately)
            </label>
          </div>

          <form @submit.prevent="saveExternalAppConfigurations">
            <label class="d-block form-label">
              GoInfoGame Long Form Quest JSON Definition
              <textarea v-model.trim="longFormQuestDef" class="form-control" rows="5" placeholder="Optional" />
            </label>

            <label class="d-block form-label">
              Imagery JSON URL
              <!-- <textarea v-model.trim="longFormQuestDef" class="form-control" rows="5" /> -->
              <input v-model.trim="imageryURL" class="form-control" placeholder="Optional" />
            </label>

            <button type="submit" class="btn btn-primary">Save Configurations</button>
          </form>
        </div><!-- .card-body -->
      </div><!-- .card -->

      <div class="card mb-4 border-danger">
        <div class="card-body">
          <h3 class="card-title mb-3">Delete Workspace</h3>

          <p>Deleting a workspace is permanent. This action will not remove any TDEI datasets outside of Workspaces.</p>

          <button class="btn btn-outline-danger mb-3" :disabled="deleteAccepted" @click="acceptDelete">
            I understand, and I want to delete this workspace
          </button>

          <template v-if="deleteAccepted">
            <label class="d-block mb-3">
              <strong>To confirm, please type "delete" in the box below:</strong>
              <input
                ref="deleteAttestationInput"
                v-model.trim="deleteAttestation"
                class="form-control border-danger"
              />
            </label>

            <button class="btn btn-danger" :disabled="deleteAttestation !== 'delete'" @click="submitDelete">
              Delete this workspace
            </button>
          </template>
        </div><!-- .card-body -->
      </div><!-- .card -->
    </div><!-- .col -->
  </app-page>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading'
import { workspacesClient } from '~/services/index'
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const route = useRoute();
const workspaceId = route.params.id;
const [workspace, longFormQuestJson] = await Promise.all([
  workspacesClient.getWorkspace(workspaceId),
  workspacesClient.getLongFormQuestDefinition(workspaceId)
]);

const workspaceName = ref(workspace.title);
const longFormQuestDef = ref(longFormQuestJson)
const imageryURL = ref(workspace.imageryURL);


const deleteAccepted = ref(false);
const deleteAttestation = ref('');
const deleteAttestationInput = ref(null);

async function save(details) {
  await workspacesClient.updateWorkspace(workspaceId, details);
}

async function rename() {
  try {
    await save({ title: workspaceName.value });
  } catch(e) {
    toast.error('Workspace rename failed:' + e.message);
    return;
  }
  toast.success('Workspace renamed successfully.');
}

async function toggleExternalAppAccess() {
  try {
    await save({ externalAppAccess: workspace.externalAppAccess });
  } catch(e) {
    toast.error('External app enable/disable failed:' + e.message);
    return;
  }
  toast.success('External app enable/disable set successfully.');    
}

const imagerySchemaUrl = import.meta.env.VITE_IMAGERY_SCHEMA
let imagerySchema: any = null;

async function saveExternalAppConfigurations() {
  if (imageryURL.value) {
    try {
      if (!imagerySchema) {
        const schemaResponse = await fetch(imagerySchemaUrl);
        if (!schemaResponse.ok) {
          throw new Error(`Could not fetch imagery schema: ${schemaResponse.statusText}`);
        }
        imagerySchema = await schemaResponse.json();
      }

      const imageryResponse = await fetch(imageryURL.value);
      if (!imageryResponse.ok) {
        throw new Error(`Failed to fetch imagery JSON from URL: ${imageryResponse.statusText}`);
      }
      const imageryJson = await imageryResponse.json();

      const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);
      const validate = ajv.compile(imagerySchema);
      const valid = validate(imageryJson);
      if (!valid) {
        toast.error(`Imagery JSON is not valid: ${ajv.errorsText(validate.errors)}`);
        return;
      }
    } catch (e) {
      toast.error(`Failed to validate imagery URL: ${e.message}`);
      return;
    }
  }

  try {
    save({ imageryURL: imageryURL.value ?? "",
      longFormQuestDef : longFormQuestDef.value,
      externalAppAccess: workspace.externalAppAccess
      })
    toast.success('Configurations saved successfully.');
  } catch(e) {
    toast.error('Failed to save configurations: ' + e.message);
  }
}

async function acceptDelete() {
  deleteAccepted.value = true;
  await nextTick();
  deleteAttestationInput.value.focus();
}

async function submitDelete() {
  await workspacesClient.deleteWorkspace(workspaceId);
  navigateTo('/dashboard');
}
</script>
