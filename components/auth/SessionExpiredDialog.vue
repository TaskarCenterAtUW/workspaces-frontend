<template>
  <b-modal
    v-model="authSessionState.dialogOpen"
    title="Session Expired"
    centered
    no-header-close
    no-close-on-backdrop
    no-close-on-esc
  >
    <p>
      Your TDEI session has expired. Sign in again to continue where you left off.
    </p>

    <p
      v-if="authSessionState.errorMessage"
      class="text-danger mb-0"
      role="alert"
    >
      {{ authSessionState.errorMessage }}
    </p>

    <p
      class="visually-hidden"
      role="status"
    >
      {{ authSessionState.loading ? 'Redirecting to TDEI Login...' : '' }}
    </p>

    <template #footer>
      <button
        class="btn btn-link session-expired-logout"
        type="button"
        :disabled="authSessionState.loading"
        @click="logout"
      >
        Logout
      </button>

      <button
        class="btn btn-primary"
        type="button"
        :disabled="authSessionState.loading"
        @click="reauthenticate"
      >
        {{ authSessionState.loading ? 'Redirecting...' : 'TDEI Login' }}
      </button>
    </template>
  </b-modal>
</template>

<script setup lang="ts">
import {
  authSessionState,
  cancelSessionReauthentication,
  getSessionReturnRoute,
  SESSION_RECOVERY_ROUTE
} from '~/services/auth-session';
import { tdeiClient } from '~/services';
import { startTdeiSsoLogin, startTdeiSsoLogout } from '~/services/sso';

const route = useRoute();

function reauthenticate(): void {
  authSessionState.loading = true;
  authSessionState.errorMessage = '';

  try {
    const returnTo = route.path === SESSION_RECOVERY_ROUTE
      ? getSessionReturnRoute(route.query.returnTo)
      : route.fullPath;

    startTdeiSsoLogin(returnTo);
  }
  catch {
    authSessionState.loading = false;
    authSessionState.errorMessage = 'Unable to start TDEI Login. Please try again.';
  }
}

function logout(): void {
  cancelSessionReauthentication();
  tdeiClient.logout();
  startTdeiSsoLogout();
}
</script>

<style scoped>
.session-expired-logout {
  text-decoration: none;
}

.session-expired-logout:hover,
.session-expired-logout:focus-visible {
  text-decoration: underline;
}
</style>
