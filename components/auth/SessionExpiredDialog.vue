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
      Enter your password to continue your session.
    </p>

    <form
      id="session-expired-form"
      @submit.prevent="reauthenticate"
    >
      <label
        class="form-label"
        for="session-expired-password"
      >
        Password
      </label>

      <div class="input-group">
        <input
          id="session-expired-password"
          ref="passwordInput"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          class="form-control"
          autocomplete="current-password"
          required
        >

        <button
          class="btn btn-outline-secondary"
          type="button"
          :aria-label="showPassword ? 'Hide password' : 'Show password'"
          @click="showPassword = !showPassword"
        >
          <app-icon
            :variant="showPassword ? 'visibility_off' : 'visibility'"
            size="20"
            no-margin
          />
        </button>
      </div>

      <p
        v-if="authSessionState.errorMessage"
        class="text-danger mt-2 mb-0"
        role="alert"
      >
        {{ authSessionState.errorMessage }}
      </p>
    </form>

    <template #footer>
      <button
        class="btn btn-link"
        type="button"
        :disabled="authSessionState.loading"
        @click="logout"
      >
        Logout
      </button>

      <button
        class="btn btn-primary"
        type="submit"
        form="session-expired-form"
        :disabled="authSessionState.loading || !password"
      >
        {{ authSessionState.loading ? 'Re-logging in...' : 'Re-Login' }}
      </button>
    </template>
  </b-modal>
</template>

<script setup lang="ts">
import { BaseHttpClientError } from '~/services/http';
import {
  authSessionState,
  cancelSessionReauthentication,
  completeSessionReauthentication,
  getSessionReturnRoute,
  SESSION_RECOVERY_ROUTE,
  SESSION_EXIT_ROUTE
} from '~/services/auth-session';
import { tdeiClient } from '~/services';

const route = useRoute();
const password = ref('');
const showPassword = ref(false);
const passwordInput = ref<HTMLInputElement | null>(null);

watch(
  () => authSessionState.dialogOpen,
  async (open) => {
    if (!open) {
      password.value = '';
      showPassword.value = false;
      return;
    }

    await nextTick();
    passwordInput.value?.focus();
  }
);

async function reauthenticate(): Promise<void> {
  authSessionState.loading = true;
  authSessionState.errorMessage = '';

  try {
    await tdeiClient.authenticate(
      authSessionState.username,
      password.value
    );

    // Hard-refresh recovery uses a temporary route; return to the original page.
    const returnTo = route.path === SESSION_RECOVERY_ROUTE
      ? getSessionReturnRoute(route.query.returnTo)
      : undefined;

    password.value = '';
    completeSessionReauthentication();

    if (returnTo) {
      await navigateTo(returnTo, { replace: true });
    }
  }
  catch (error: unknown) {
    password.value = '';

    authSessionState.errorMessage
      = error instanceof BaseHttpClientError
        && error.response.status === 401
        ? 'Incorrect password. Please try again.'
        : 'Unable to restore your session. Please try again.';
  }
  finally {
    authSessionState.loading = false;

    if (authSessionState.dialogOpen) {
      await nextTick();
      passwordInput.value?.focus();
    }
  }
}

async function logout(): Promise<void> {
  cancelSessionReauthentication();
  tdeiClient.logout();

  await navigateTo(SESSION_EXIT_ROUTE, { replace: true });
}
</script>
