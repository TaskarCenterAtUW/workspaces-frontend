<template>
  <div class="signin-card card">
    <form class="card-body" @submit.prevent="submit">
      <div class="mb-3">
        <label for="username" class="form-label">TDEI Username</label>
        <input id="username" v-model="username" class="form-control" aria-describedby="usernameHelp">
        <div id="usernameHelp" class="form-text">
          Enter the same username that you provide to use the TDEI API.
        </div>
      </div>

      <div class="mb-3">
        <label for="password" class="form-label">Password</label>
        <input id="password" v-model="password" type="password" class="form-control">
      </div>

      <button type="submit" class="btn btn-primary" :disabled="disabled">
        <app-spinner v-if="loading.active" size="sm" />
        <template v-else>Submit</template>
      </button>
      <span class="ms-3 text-danger align-middle">{{ error }}</span>
    </form>
  </div>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading';
import { tdeiClient, osmClient } from '~/services/index';

const loading = reactive(new LoadingContext());
const error = ref ('')
const username = ref('');
const password = ref('');
const disabled = computed(() => loading.active || !username.value.length || !password.value.length);

async function submit() {
  error.value = ''

  try {
    await signIn();
  } catch (e: unknown)  {
    if (e.response?.status === 400) {
      const body = await e.response.json();

      if (body.errors?.length > 0) {
        error.value = 'Error: ' + body.errors[0];
        return;
      }
    }

    if (e.response?.status === 401) {
      error.value = 'Incorrect TDEI username/password.';
      return;
    }

    if (e.response?.status === 404) {
      error.value = `A TDEI account for "${username.value}" does not exist.`;
      return;
    }

    error.value = e.toString();
  }
}

async function signIn() {
  await loading.wrap(tdeiClient, async (client) => {
    await client.authenticate(username.value, password.value);
  })

  await loading.wrap(osmClient, async (client) => {
    await client.provisionUser();
  })

  if (window.rememberRoute) {
    navigateTo(window.rememberRoute);
    delete window.rememberRoute;
  } else {
    navigateTo('/dashboard');
  }
}
</script>
