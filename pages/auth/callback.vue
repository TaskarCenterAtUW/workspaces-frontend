<template>
  <section class="auth-callback-page">
    <div class="card auth-callback-card">
      <div class="card-body text-center">
        <app-logo />
        <h1>{{ error ? 'Login unsuccessful' : 'Signing you in' }}</h1>

        <template v-if="error">
          <p
            class="text-danger mt-3"
            role="alert"
          >
            {{ error }}
          </p>
          <button
            type="button"
            class="btn btn-primary mt-2"
            @click="retryLogin"
          >
            Try TDEI Login Again
          </button>
        </template>

        <div
          v-else
          class="mt-4"
          aria-live="polite"
        >
          <b-spinner label="Completing TDEI authentication" />
          <p class="mt-3 mb-0">Completing TDEI authentication...</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { osmClient, tdeiClient } from '~/services/index';
import { resolveHttpErrorMessage } from '~/services/http';
import {
  consumeSsoReturnTo,
  getStoredSsoReturnTo,
  startTdeiSsoLogin
} from '~/services/sso';

const route = useRoute();
const error = ref('');

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function retryLogin() {
  startTdeiSsoLogin(getStoredSsoReturnTo());
}

onMounted(async () => {
  const code = queryString(route.query.code);
  const state = queryString(route.query.state);
  const clientId = queryString(route.query.clientId)
    || import.meta.env.VITE_KEYCLOAK_CLIENT_ID;

  window.history.replaceState(window.history.state, '', route.path);

  if (!code || !state) {
    error.value = 'TDEI SSO callback is missing code or state.';
    return;
  }

  try {
    await tdeiClient.completeSsoLogin(code, state, clientId);
    await osmClient.provisionUser();
    await navigateTo(consumeSsoReturnTo(), { replace: true });
  }
  catch (callbackError: unknown) {
    error.value = await resolveHttpErrorMessage(
      callbackError,
      'Unable to complete TDEI login.'
    );
  }
});
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.auth-callback-page {
  min-height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-image: url('~/assets/img/bg_login.png');
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center top;
}

.auth-callback-card {
  width: 100%;
  max-width: 450px;
  border-radius: 10px;
  box-shadow: $box-shadow-lg;

  .card-body {
    padding: 2rem 1.5rem;
  }

  .app-logo {
    width: 80px;
    margin-bottom: 1rem;
  }

  h1 {
    font-size: 1.625rem;
    font-weight: 300;
    color: $text-navy;
  }
}
</style>
