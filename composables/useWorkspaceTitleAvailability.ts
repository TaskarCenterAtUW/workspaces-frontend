import { workspacesClient } from '~/services/index';

import type { Ref } from 'vue';

const CHECK_DELAY = 300;

export function useWorkspaceTitleAvailability(
  title: Ref<string>,
  projectGroupId: Ref<string | null>
) {
  const available = ref<boolean | null>(null);
  const checking = ref(false);
  const error = ref<Error | null>(null);
  let requestId = 0;
  let checkTimer: ReturnType<typeof setTimeout> | undefined;

  function reset() {
    clearTimeout(checkTimer);
    available.value = null;
    checking.value = false;
    error.value = null;
  }

  async function check() {
    const currentRequestId = ++requestId;
    const normalizedTitle = title.value.trim();
    const currentProjectGroupId = projectGroupId.value;

    if (!normalizedTitle || !currentProjectGroupId) {
      reset();
      return;
    }

    checking.value = true;
    error.value = null;

    try {
      const result = await workspacesClient.checkWorkspaceTitleAvailability({
        title: normalizedTitle,
        tdeiProjectGroupId: currentProjectGroupId,
      });
      if (currentRequestId === requestId) {
        available.value = result.available;
      }
    }
    catch (reason: unknown) {
      if (currentRequestId === requestId) {
        available.value = null;
        error.value = reason instanceof Error
          ? reason
          : new Error('Unable to check workspace title availability.');
      }
    }
    finally {
      if (currentRequestId === requestId) {
        checking.value = false;
      }
    }
  }

  watch([title, projectGroupId], () => {
    ++requestId;
    reset();

    const normalizedTitle = title.value.trim();
    if (!normalizedTitle || !projectGroupId.value) {
      return;
    }

    checkTimer = setTimeout(() => {
      void check();
    }, CHECK_DELAY);
  });

  onUnmounted(() => {
    ++requestId;
    clearTimeout(checkTimer);
  });

  return {
    available,
    checking,
    error,
  };
}
