// Test outline
// @test e2e: loading this page as a workspace owner shows a form listing the workspaces eligible to merge with this
one (playwright snapshot this)
// @test e2e: loading this page as a non-owner shows the "only workspace owners can merge" warning and leaves the Merge
button disabled (assert() the button is disabled)
// @test e2e: a workspace with no eligible merge targets shows the "no existing workspaces will merge" panel with a
link back to the dashboard (playwright snapshot this)
// @test e2e: the project group picker offers only the workspace's own project group, so a merge cannot relocate data
into another tenant (assert() the options list has exactly one entry)
// @test e2e: entering a title already used in the project group shows the "not available" hint and leaves Merge
disabled (assert() this)
// @test e2e: the form warns that the merged workspace will not be linked to a TDEI dataset, and for a GTFS Pathways
workspace that it then cannot be exported to TDEI (assert() the warning text for each type)
// @test e2e: merging two workspaces with no conflicts commits the merge and navigates to the new workspace's editor,
centred on the merged data (assert() the URL)
// @test e2e: merging two workspaces with conflicts navigates to the conflicts page instead of committing (assert()
the URL)
// @test e2e: a failing merge shows an error toast and re-enables the Merge button rather than failing silently
(assert() the toast text)
// @test e2e: validate that all the API calls used on this page match the Swagger spec
(https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)

<template>
  <app-page class="merge-page">
    <h1 class="mb-5 h2 text-lg-center">Merge Workspace</h1>

    <b-row>
      <b-col
        xxl="7"
        class="mx-auto"
      >
        <b-alert
          v-if="!isLead"
          variant="warning"
          show
          class="mb-4"
        >
          Only workspace owners can merge workspaces. Contact your workspace owner to proceed.
        </b-alert>

        <!-- The Merge button stays disabled once a merge has committed, so the
             page has to say why and where the result went. -->
        <b-alert
          v-if="navigationFailed && mergedWorkspaceId !== undefined"
          variant="success"
          show
        >
          The merge finished and created workspace {{ mergedWorkspaceId }}, but opening its
          editor failed.
          <b-link :to="editorRoute(mergedWorkspaceId, workspace.type)">
            Open the merged workspace
          </b-link>
          or <b-link to="/dashboard">return to the dashboard</b-link>.
        </b-alert>

        <b-card
          v-if="workspaces.length"
          class="mb-3"
          no-body
        >
          <b-card-body>
            <label
              class="d-block mb-3"
              for="merge_target"
            >
              Merge workspace <strong>"{{ workspace.title }}"</strong> with:
              <b-form-select
                id="merge_target"
                v-model="selectedWorkspace"
                class="mt-2"
                :options="workspaceOptions"
                :disabled="!isLead"
              />
            </label>

            <dashboard-workspace-information
              v-if="selectedWorkspace"
              :workspace="selectedWorkspace"
              :my-tdei-roles="myTdeiRoles"
            />

            <label
              class="d-block my-3"
              for="merge_title"
            >
              Merged Workspace Title
              <b-form-input
                id="merge_title"
                v-model.trim="workspaceTitle"
                :disabled="!isLead"
                :state="titleState"
              />
            </label>
            <p
              v-if="titleAvailable === false"
              class="text-danger small mt-n2 mb-3"
            >
              A workspace with this title already exists in this project group.
            </p>

            <label
              class="d-block mb-3"
              for="merge_project_group"
            >
              Project Group
              <project-group-picker
                id="merge_project_group"
                v-model="projectGroupId"
                :options="eligibleProjectGroups"
                :disabled="!isLead"
              />
            </label>
            <p class="text-body-secondary small">
              The merged workspace stays in this workspace's project group.
            </p>

            <!-- The merged workspace is not created from a TDEI dataset, so it
                 carries no dataset ID. Said before the merge runs, because it
                 cannot be added afterwards. -->
            <b-alert
              :model-value="true"
              variant="warning"
              class="small mb-0"
            >
              <template v-if="workspace.type === 'pathways'">
                The merged workspace will not be linked to a TDEI dataset, and a GTFS
                Pathways workspace without that link cannot be exported to TDEI. Export
                this data before merging if you need it on the platform.
              </template>
              <template v-else>
                The merged workspace will not be linked to a TDEI dataset, so exporting it
                publishes a new dataset rather than a new version of this one.
              </template>
            </b-alert>
          </b-card-body>

          <b-card-footer class="d-flex">
            <b-button
              variant="link"
              to="/dashboard"
            >
              Cancel
            </b-button>
            <b-button
              variant="primary"
              class="ms-auto"
              :disabled="!complete || !isLead || merging || mergedWorkspaceId !== undefined"
              @click="merge"
            >
              <app-spinner
                v-if="merging"
                size="sm"
              />
              <template v-else>
                Merge <app-icon
                  variant="arrow_circle_right"
                  no-margin
                />
              </template>
            </b-button>
          </b-card-footer>
        </b-card>

        <b-card
          v-else
          class="mb-3"
        >
          <div class="text-center">
            <app-icon
              variant="warning"
              size="36"
              class="my-3"
            />
            <p>No existing workspaces will merge with <strong>{{ workspace.title }}</strong>.</p>
            <p>Eligible workspaces must be created from the same TDEI dataset and belong to the same project group.</p>
            <return-to-dashboard-button />
          </div>
        </b-card>
      </b-col>
    </b-row>
  </app-page>
</template>

<script setup lang="ts">
import { toast } from 'vue3-toastify';

import { resolveHttpErrorMessage } from '~/services/http';
import {
  tdeiUserClient,
  workspacesClient,
  workspaceMergerFactory
} from '~/services/index';
import { editorHashFor, editorRoute } from '~/util/osm';

import type { Workspace } from '~/types/workspaces';

import 'vue3-toastify/dist/index.css';

const route = useRoute();
const workspaceId = Number(route.params.id);
const workspace = await workspacesClient.getWorkspace(workspaceId);

// For child components, which reach it through `useWorkspaceRole`. This page
// reads the role directly: `inject` resolves against the parent's provides, so
// a component cannot inject what it provided itself.
//
provide('workspace', workspace);

const isLead = computed(() => workspace.role === 'lead');

const merger = workspaceMergerFactory.getThreeWayMerger(workspace);

const [workspaces, { items: myProjectGroups }] = await Promise.all([
  merger.getMergeTargets(),
  tdeiUserClient.getMyProjectGroups(1, '', 10000)
]);

// A merge copies both workspaces' data into the new one, so retargeting it at
// another project group would move that data across a tenant boundary:
//
const eligibleProjectGroups = myProjectGroups.filter(
  pg => pg.tdei_project_group_id === workspace.tdeiProjectGroupId
);

// Taken from the list fetched above rather than by a second request:
// getMyRolesForProjectGroupById hits the same URL with the same parameters.
//
const myTdeiRoles = eligibleProjectGroups[0]?.roles ?? [];

const selectedWorkspace = ref<Workspace | undefined>();
const workspaceTitle = ref(`Merged: ${workspace.title}`);
const projectGroupId = ref<string | null>(workspace.tdeiProjectGroupId);
const merging = ref(false);

// Set once a merge has committed. The workspace exists from that point on, so
// the button stays disabled even if the navigation to its editor failed.
const mergedWorkspaceId = ref<number>();

// Set only once the navigation to the merged workspace has actually failed.
// The id alone is not the signal: it is known before the navigation, and the
// page is still on screen while the router resolves and through the 300ms
// out-in transition, so a panel driven by the id paints on every success.
const navigationFailed = ref(false);

const { available: titleAvailable } = useWorkspaceTitleAvailability(
  workspaceTitle,
  projectGroupId
);

const workspaceOptions = computed(() =>
  workspaces.map(w => ({ value: w, text: w.title }))
);

const titleState = computed(() => titleAvailable.value === false ? false : null);

const complete = computed(() =>
  workspaceTitle.value.trim().length > 0
  && !!projectGroupId.value
  && selectedWorkspace.value !== undefined
  && titleAvailable.value !== false
);

async function merge() {
  // The no-conflict path commits here without ever reaching the owner check
  // `commitMerge` makes on the conflicts page, so this needs its own:
  //
  if (!selectedWorkspace.value || !projectGroupId.value || !isLead.value) {
    return;
  }

  // The button's `:disabled` binding only takes effect on the next flush, so
  // two clicks dispatched in one task would both run a merge and each create
  // its own workspace:
  //
  if (merging.value) {
    return;
  }

  merging.value = true;

  try {
    const result = await merger.merge(
      selectedWorkspace.value.id,
      projectGroupId.value,
      workspaceTitle.value
    );

    if (result.conflicts.length === 0) {
      mergedWorkspaceId.value = await workspaceMergerFactory.commit(result);

      setMergeResult(null);

      // `navigateTo` resolves with a failure for an aborted navigation rather
      // than throwing, so its result is what tells us the editor did not open:
      //
      navigationFailed.value = !!await navigateTo(
        editorRoute(mergedWorkspaceId.value, result.type, editorHashFor(result.elements))
      );

      return;
    }

    setMergeResult(result);

    if (await navigateTo(`/workspace/${workspaceId}/merge/conflicts`)) {
      setMergeResult(null);
      toast.error('The merge found conflicts, but the page to resolve them failed to open.');
    }
  }
  catch (error) {
    // Past the commit the merged workspace exists, so this is a failed
    // navigation, not a failed merge. Reporting it as one sends the user to
    // merge again, which creates a second workspace. The success panel says
    // so and links to the workspace, so a toast as well would repeat it:
    //
    if (mergedWorkspaceId.value !== undefined) {
      navigationFailed.value = true;
      return;
    }

    // A merge with conflicts is already in the shared state if navigating to
    // its page threw. Left there, it would be offered later against data that
    // has since changed:
    //
    setMergeResult(null);
    toast.error(await resolveHttpErrorMessage(error, 'Failed to merge workspaces'));
  }
  finally {
    merging.value = false;
  }
}
</script>
