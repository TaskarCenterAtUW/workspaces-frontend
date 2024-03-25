<template>
  <div class="signin-card card">
    <form class="card-body" @submit.prevent="submit">
      <div class="mb-3">
        <label for="username" class="form-label">TDEI Username</label>
        <input v-model="username" class="form-control" id="username" aria-describedby="usernameHelp">
        <div id="usernameHelp" class="form-text">
          Enter the same username that you provide to use the TDEI API.
        </div>
      </div>

      <div class="mb-3">
        <label for="password" class="form-label">Password</label>
        <input v-model="password" type="password" class="form-control" id="password">
      </div>

      <button type="submit" class="btn btn-primary" :disabled="disabled">
        <app-spinner v-if="loading.active" size="sm" />
        <template v-else>Submit</template>
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { LoadingContext } from '~/services/loading'
import { tdeiClient } from '~/services/index'

const loading = reactive(new LoadingContext())
const username = ref('')
const password = ref('')
const disabled = computed(() => loading.active || !username.value.length || !password.value.length)

async function submit() {
  await loading.wrap(tdeiClient, async (client) => {
    await client.authenticate(username.value, password.value)
  })

  navigateTo('/dashboard')
}
</script>
