import { workspacesClient } from '~/services/index';

import type { Ref } from 'vue';
import type { WorkspaceCreateCheck, WorkspaceType } from '~/types/workspaces';

// Asks the backend's check-create whether this workspace could be created, so
// the create pages show the rules the backend actually enforces. `reason` is
// set when the backend says no. A failed check leaves it null: the create call
// enforces the same rules and reports its own error, so a backend that isn't
// deployed yet or a TDEI outage never blocks the form.
export function useWorkspaceCreateCheck(
  type: Ref<string | null | undefined>,
  projectGroupId: Ref<string | null>,
  tdeiRecordId?: Ref<string | null>
) {
  const reason = ref<string | null>(null);
  const checking = ref<boolean>(false);
  let requestId = 0;

  async function check(): Promise<WorkspaceCreateCheck | null> {
    const currentRequestId = ++requestId;
    reason.value = null;

    const currentType = type.value?.trim().toLowerCase();
    const currentProjectGroupId = projectGroupId.value;
    const currentRecordId = tdeiRecordId?.value;
    if (!currentType || !currentProjectGroupId || (tdeiRecordId && !currentRecordId)) {
      checking.value = false;
      return null;
    }

    checking.value = true;
    try {
      const result = await workspacesClient.checkWorkspaceCreate({
        type: currentType as WorkspaceType,
        tdeiProjectGroupId: currentProjectGroupId,
        ...(currentRecordId ? { tdeiRecordId: currentRecordId } : {}),
      });
      if (currentRequestId === requestId) {
        if (!result.canCreate) {
          reason.value = result.reason || 'You do not have permission to create this workspace.';
        }
        return result;
      }
    }
    catch (e) {
      console.warn('Workspace create pre-check failed; the create call will enforce permissions', e);
    }
    finally {
      if (currentRequestId === requestId) {
        checking.value = false;
      }
    }
    return null;
  }

  watch(
    () => [type.value, projectGroupId.value, tdeiRecordId?.value],
    () => { void check(); },
    { immediate: true }
  );

  onUnmounted(() => {
    ++requestId;
  });

  return { reason, checking, check };
}
