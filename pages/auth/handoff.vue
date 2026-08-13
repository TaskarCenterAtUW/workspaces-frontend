<template>
  <app-page>
    <div
      class="visually-hidden"
      aria-live="polite"
    >
      {{ statusMessage }}
    </div>

    <app-confirmation-dialog
      :busy="busy"
      :message="dialogMessage"
      :primary-action-label="primaryActionLabel"
      :secondary-action-label="secondaryActionLabel"
      :title="dialogTitle"
      :visible="dialogVisible"
      @close="cancelHandoff"
      @primary-action="primaryAction"
      @secondary-action="cancelHandoff"
    />
  </app-page>
</template>

<script setup lang="ts">
import { tdeiClient } from '~/services/index';
import {
  AUTH_HANDOFF_ERROR_KEY,
  clearPendingAuthHandoff,
  loadPendingAuthHandoff,
} from '~/util/auth-handoff';

const { activate } = useAuthHandoff();
const pendingHandoff = ref(loadPendingAuthHandoff());
const errorMessage = ref(sessionStorage.getItem(AUTH_HANDOFF_ERROR_KEY) ?? '');
const busy = ref(false);
const dialogVisible = ref(true);
const statusMessage = ref('');

sessionStorage.removeItem(AUTH_HANDOFF_ERROR_KEY);

const currentDisplayName = computed(() =>
  tdeiClient.auth.displayName || tdeiClient.auth.username || 'your current account');
const isConfirmation = computed(() => pendingHandoff.value !== null && !errorMessage.value);
const dialogTitle = computed(() => isConfirmation.value
  ? 'Switch Workspaces account?'
  : 'Account switch failed');
const dialogMessage = computed(() => {
  if (isConfirmation.value) {
    return `Workspaces is currently signed in as ${currentDisplayName.value}. The TDEI Portal is signed in with a different account. Continue and switch Workspaces to the TDEI Portal account?`;
  }

  return errorMessage.value
    || `The account switch could not be completed. You are still signed in as ${currentDisplayName.value}.`;
});
const primaryActionLabel = computed(() => isConfirmation.value
  ? 'Switch account'
  : 'Go to dashboard');
const secondaryActionLabel = computed(() => isConfirmation.value
  ? `No, keep ${currentDisplayName.value}`
  : null);

if (!pendingHandoff.value && !errorMessage.value) {
  navigateTo(tdeiClient.auth.ok ? '/dashboard' : '/signin', { replace: true });
}

async function primaryAction() {
  if (!isConfirmation.value) {
    await finish('/dashboard');
    return;
  }

  const handoff = pendingHandoff.value!;
  busy.value = true;
  statusMessage.value = 'Switching Workspaces to the TDEI Portal account.';

  try {
    await activate(handoff.refreshToken);
    await finish(handoff.destination);
  }
  catch {
    clearPendingAuthHandoff();
    pendingHandoff.value = null;
    errorMessage.value = `The TDEI account switch could not be completed. You are still signed in as ${currentDisplayName.value}.`;
    statusMessage.value = errorMessage.value;
  }
  finally {
    busy.value = false;
  }
}

async function cancelHandoff() {
  if (busy.value) {
    return;
  }

  // Close immediately so cancellation never appears unresponsive while the
  // dashboard route and its initial data are loading.
  dialogVisible.value = false;
  statusMessage.value = `Account switch cancelled. You are still signed in as ${currentDisplayName.value}.`;
  await finish('/dashboard');
}

async function finish(destination: string) {
  clearPendingAuthHandoff();
  sessionStorage.removeItem(AUTH_HANDOFF_ERROR_KEY);
  await navigateTo(destination, { replace: true });
}
</script>
