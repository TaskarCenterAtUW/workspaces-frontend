<!--
  Test outline → generated in test/e2e/signin.spec.ts
  @test e2e: an unauthenticated user starts TDEI SSO from the TDEI Login button
  @test e2e: registration and password recovery link back to the configured TDEI Portal pages
-->
<template>
  <div class="signin-card card">
    <form
      class="card-body signin-card-body"
      @submit.prevent="submit"
    >
      <div class="signin-header">
        <app-logo />
        <h1 class="signin-title">
          Welcome!
        </h1>
        <p class="signin-subtitle">
          Sign in with your TDEI account.
        </p>
      </div>

      <template v-if="ENABLE_PASSWORD_LOGIN">
        <div class="mb-4">
          <label
            for="username"
            class="form-label signin-label"
          >TDEI Username</label>
          <input
            id="username"
            v-model="username"
            class="form-control signin-input"
            aria-describedby="usernameHelp"
          >
          <div
            id="usernameHelp"
            class="form-text signin-help-text"
          >
            Enter the same username that you provide to use the TDEI API.
          </div>
        </div>

        <div class="mb-4">
          <label
            for="password"
            class="form-label signin-label"
          >Password</label>
          <div class="input-group password-group">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="form-control signin-input password-input"
            >
            <button
              type="button"
              class="btn password-toggle"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              <app-icon
                :variant="showPassword ? 'visibility_off' : 'visibility'"
                size="24"
                no-margin
              />
            </button>
          </div>
        </div>

        <button
          type="submit"
          class="btn btn-primary signin-submit"
          :disabled="disabled"
        >
          {{ loading.active ? 'Signing In...' : 'Sign In' }}
        </button>
      </template>

      <button
        type="button"
        class="btn btn-primary signin-submit"
        :disabled="ssoPending"
        @click="handleSsoLogin"
      >
        {{ ssoPending ? 'Redirecting...' : 'TDEI Login' }}
      </button>

      <div
        v-if="error"
        class="signin-error"
      >
        {{ error }}
      </div>

      <nav
        class="signin-account-links"
        aria-label="TDEI account"
      >
        <p class="signin-register-prompt">
          New to TDEI?
          <a :href="registerUrl">Register Now</a>
        </p>
        <a :href="forgotPasswordUrl">Forgot Password?</a>
      </nav>
    </form>
  </div>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading'
import { tdeiClient, osmClient } from '~/services/index'
import { startTdeiSsoLogin } from '~/services/sso'

const ENABLE_PASSWORD_LOGIN = false
const loading = reactive(new LoadingContext())
const error = ref ('')
const ssoPending = ref(false)
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const disabled = computed(() => loading.active || !username.value.length || !password.value.length)
const tdeiPortalUrl = import.meta.env.VITE_TDEI_PORTAL_URL
const registerUrl = new URL('/register', tdeiPortalUrl).toString()
const forgotPasswordUrl = new URL('/ForgotPassword', tdeiPortalUrl).toString()

function handleSsoLogin() {
  error.value = ''
  ssoPending.value = true

  const rememberedRoute = window.rememberRoute
  const returnTo = typeof rememberedRoute?.fullPath === 'string'
    ? rememberedRoute.fullPath
    : '/dashboard'
  startTdeiSsoLogin(returnTo)
}

async function submit() {
  error.value = ''

  try {
    await signIn()
  }
  catch (e: unknown) {
    const isFetchError = (err: unknown): err is { response: { status: number; json: () => Promise<unknown> } } =>
      typeof err === 'object' && err !== null
      && 'response' in err
      && typeof (err as { response: unknown }).response === 'object'
      && (err as { response: unknown }).response !== null
      && typeof ((err as { response: { json?: unknown } }).response).json === 'function'

    if (isFetchError(e)) {
      if (e.response.status === 400) {
        const body = await e.response.json() as { errors?: string[] }

        if (body.errors && body.errors.length > 0) {
          error.value = 'Error: ' + body.errors[0]
          return
        }
      }

      if (e.response.status === 401) {
        error.value = 'Incorrect TDEI username/password.'
        return
      }

      if (e.response.status === 404) {
        error.value = `A TDEI account for "${username.value}" does not exist.`
        return
      }
    }

    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function signIn() {
  await loading.wrap(tdeiClient, async (client) => {
    await client.authenticate(username.value, password.value)
  })

  await loading.wrap(osmClient, async (client) => {
    await client.provisionUser()
  })

  if (window.rememberRoute) {
    navigateTo(window.rememberRoute)
    delete window.rememberRoute
  }
  else {
    navigateTo('/dashboard')
  }
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.signin-card {
  width: 100%;
  max-width: 450px;
  margin: 0 auto;
  border: 1px solid rgba($text-navy, 0.18);
  border-radius: 10px;
  box-shadow: $box-shadow-lg;
  background: rgba(255, 255, 255, 0.96);
}

.signin-card-body {
  padding: 2rem 1.5rem 1.75rem;
}

.signin-header {
  margin-bottom: 2rem;
}

.signin-header .app-logo {
  width: 80px;
  margin: 0 0 15px;
}

.signin-title {
  margin-bottom: 2px;
  font-size: 26px;
  font-weight: 300;
  color: $text-navy;
}

.signin-subtitle {
  margin-bottom: 0;
  font-size: 0.875rem;
  color: var(--secondary-color);
}

.signin-label {
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: $text-navy;
}

.signin-input {
  min-height: 52px;
  border: 1px solid #d0d6e2;
  border-radius: 8px;
  color: $text-navy;
  font-size: 0.875rem;

  &:focus {
    border-color: #c3cbde;
    box-shadow: none;
  }
}

.signin-help-text {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: var(--secondary-color);
}

.password-group {
  .password-input {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
}

.password-toggle {
  min-width: 70px;
  border: 1px solid #d0d6e2;
  border-left: 0;
  border-radius: 0 8px 8px 0;
  background: #ffffff;
  color: #7c7c7c;

  &:hover,
  &:focus,
  &:active {
    border-color: #d0d6e2;
    background: #ffffff;
    color: #5f647a;
    box-shadow: none;
  }
}

.signin-submit {
  width: 100%;
  min-height: 52px;
  margin-top: 0.75rem;
  font-size: 0.9375rem;

  &:disabled {
    background-color: #8b72b4;
    border-color: #8b72b4;
    color: #ffffff;
    opacity: 0.8;
    cursor: not-allowed;
  }
}

.signin-error {
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: #cc2c47;
}

.signin-account-links {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 2rem;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: $text-navy;

  a {
    color: $primary;
    font-weight: 600;
    text-decoration: none;

    &:hover {
      color: $primary-hover;
      text-decoration: none;
    }
  }
}

.signin-register-prompt {
  margin: 0;
}

@include media-breakpoint-down(sm) {
  .signin-card {
    max-width: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
    min-height: calc(100vh - 60px);
    background: rgba(255, 255, 255, 0.92);
  }

  .signin-card-body {
    padding: 1.5rem 1rem 1.5rem;
  }
}
</style>
