// Test outline
// @test e2e: loading this page with a merge in progress lists every conflict in the sidebar with geometry/tags badges
(playwright snapshot this)
// @test e2e: loading this page directly, with no merge in progress, redirects back to the merge page (assert() the
URL and that the merge page renders)
// @test e2e: leaving this page without its buttons (browser back, a header link) drops the merge, so coming back
does not offer a merge computed from outdated data (assert() the redirect on return)
// @test e2e: clicking a conflict in the sidebar shows its two versions on the map and its tag differences in the
table below (playwright snapshot this)
// @test e2e: "Keep A" and "Keep B" resolve a conflict in one click and keep the tags the other side did not dispute
(assert() the resolved count and the committed osmChange)
// @test e2e: a delete-versus-edit conflict offers "Delete Element" instead of a plain A/B choice, and choosing it
removes the element from the merge (assert() the button set)
// @test e2e: "Commit Merge" stays disabled until every conflict is resolved (assert() the disabled state)
// @test e2e: committing creates the merged workspace and navigates to its editor, without the page saying no merge
is in progress on the way out (assert() the URL and that the notice never appears)
// @test e2e: a failing commit shows an error toast and re-enables the button rather than failing silently (assert()
the toast text)
// @test e2e: a non-owner sees the commit controls disabled with an explanation (assert() the disabled state)
// @test e2e: validate that all the API calls used on this page match the Swagger spec
(https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)

<template>
  <section
    v-if="hasMergeForThisWorkspace"
    class="merge-conflicts-page"
  >
    <merge-conflict-status-alerts
      :unresolved-count="unresolvedCount"
      :total="conflicts.length"
      :is-lead="isLead"
    />

    <div class="conflicts-body">
      <merge-conflict-sidebar
        v-model="selectedIndex"
        :conflicts="conflicts"
        :resolved="resolvedFlags"
        :unresolved-count="unresolvedCount"
        :committing="committing"
        :is-lead="isLead"
        @cancel="cancelMerge"
        @commit="commitMerge"
      />

      <merge-conflict-detail
        ref="conflictDetailRef"
        :conflict="selectedConflict"
        :resolution="currentResolution"
        :lookup="mergeResult?.elements"
        :ancestor="mergeResult?.ancestor"
        :committing="committing"
        @keep-side="keepSide(selectedIndex, $event)"
        @drop-element="dropElement(selectedIndex)"
        @choose-side="chooseSide(selectedIndex, $event)"
        @set-tag="(key, value) => setTag(selectedIndex, key, value)"
        @inspect="openEditor"
      />
    </div>
  </section>

  <section
    v-else-if="navigationFailed && mergedWorkspaceId !== undefined"
    class="merge-conflicts-page p-4"
  >
    <b-alert
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
  </section>

  <section
    v-else
    class="merge-conflicts-page p-4"
  >
    <b-alert
      v-if="!leaving"
      :model-value="true"
      variant="secondary"
    >
      No merge is in progress.
      <b-link :to="`/workspace/${workspaceId}/merge`">Start one</b-link>
      or <b-link to="/dashboard">return to the dashboard</b-link>.
    </b-alert>
  </section>
</template>

<script setup lang="ts">
import { useModal } from 'bootstrap-vue-next/composables/useModal';
import { toast } from 'vue3-toastify';

import { resolveHttpErrorMessage } from '~/services/http';
import { applyResolutions } from '~/services/merge';
import { workspacesClient, workspaceMergerFactory } from '~/services/index';
import { editorRoute, mapHash } from '~/util/osm';

import type ConflictDetail from '~/components/merge/ConflictDetail.vue';
import type { MergeConflict } from '~/services/merge';

import 'vue3-toastify/dist/index.css';

const route = useRoute();
const workspaceId = Number(route.params.id);

const mergeResult = useMergeResult();

// Before the first `await` below, so the unmount clear is registered even if
// the user leaves, or the workspace fails to load, while it loads:
//
const {
  hasMergeForThisWorkspace,
  mergedWorkspaceId,
  leaving,
  navigationFailed,
  leaveMerge
} = useMergeExit(workspaceId);

const workspace = await workspacesClient.getWorkspace(workspaceId);

// For child components, which reach it through `useWorkspaceRole`. This page
// reads the role directly: `inject` resolves against the parent's provides, so
// a component cannot inject what it provided itself.
//
provide('workspace', workspace);

const isLead = computed(() => workspace.role === 'lead');
const { create } = useModal();

const conflicts = mergeResult.value?.conflicts ?? [];

const {
  resolutions,
  unresolvedCount,
  chooseSide,
  keepSide,
  dropElement,
  setTag,
  isResolved
} = useConflictResolutions(conflicts);

const selectedIndex = ref(0);
const committing = ref(false);
const conflictDetailRef = useTemplateRef<InstanceType<typeof ConflictDetail>>('conflictDetailRef');

const selectedConflict = computed<MergeConflict | undefined>(
  () => conflicts[selectedIndex.value]
);

const currentResolution = computed(() => resolutions[selectedIndex.value]);

const resolvedFlags = computed(() => conflicts.map((_, i) => isResolved(i)));

/**
 * The merge only exists in memory, so leaving for workspace A's editor is a
 * one-way trip: confirm before throwing away the resolutions made so far.
 */
async function openEditor() {
  const merge = mergeResult.value;

  if (!merge) {
    return;
  }

  const confirmed = await create({
    title: 'Leave this merge?',
    body: 'Opening the editor leaves this merge. Your conflict resolutions will be lost.',
    okTitle: 'Open Editor',
    okVariant: 'danger',
    cancelTitle: 'Stay',
    cancelClass: 'btn-link p-0',
    cancelVariant: null
  }).show();

  // The modal outlives the page, so the user may have left this merge by
  // another route while it was open:
  //
  if (!confirmed?.ok || mergeResult.value !== merge) {
    return;
  }

  const view = conflictDetailRef.value?.getLatLonZoom();

  await leaveMerge(editorRoute(merge.workspaceIdA, merge.type, view && mapHash(view)));
}

async function cancelMerge() {
  await leaveMerge('/dashboard');
}

async function commitMerge() {
  if (
    unresolvedCount.value > 0
    || !hasMergeForThisWorkspace.value
    || !mergeResult.value
    || !isLead.value
  ) {
    return;
  }

  // The button's `:disabled` binding only takes effect on the next flush, so
  // two clicks dispatched in one task both get here and each creates its own
  // workspace and changeset:
  //
  if (committing.value) {
    return;
  }

  committing.value = true;

  // The map is showing the merged data, so its view is the right place to open
  // the editor, exactly as `openEditor` does:
  //
  const position = conflictDetailRef.value?.getLatLonZoom();

  try {
    const elements = applyResolutions(
      mergeResult.value.elements,
      conflicts,
      resolutions,
      mergeResult.value.ancestor
    );

    mergedWorkspaceId.value = await workspaceMergerFactory.commit(
      mergeResult.value,
      elements
    );

    navigationFailed.value = await leaveMerge(
      editorRoute(mergedWorkspaceId.value, workspace.type, position && mapHash(position))
    );
  }
  catch (error) {
    // Past the commit the merge is already in a new workspace, so this is a
    // failed navigation rather than a failed commit. The success panel says
    // so and links to the workspace, so a toast as well would repeat it:
    //
    if (mergedWorkspaceId.value !== undefined) {
      navigationFailed.value = true;
      return;
    }

    toast.error(await resolveHttpErrorMessage(error, 'Failed to commit the merge'));
  }
  finally {
    committing.value = false;
  }
}
</script>

<style scoped lang="scss">
.merge-conflicts-page {
  display: flex;
  flex-direction: column;
  height: 100%;

  .conflicts-body {
    display: flex;
    flex: 1 1 0;
    min-height: 0;
  }
}
</style>
