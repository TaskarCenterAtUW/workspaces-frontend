<template>
  <nav class="app-navbar navbar navbar-expand-lg shadow">
    <div class="container">
      <nuxt-link class="navbar-brand" to="/">
        <app-logo />
        <span>TDEI</span>&nbsp;<span>Workspaces</span>
      </nuxt-link>

      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="navbarSupportedContent">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item">
            <nuxt-link class="nav-link" aria-current="page" to="/">Home</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link" to="/dashboard">Dashboard</nuxt-link>
          </li>
          <li class="nav-item">
            <nuxt-link class="nav-link" to="/workspace/create">Create Workspace</nuxt-link>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="#">Help</a>
          </li>
        </ul>

        <nuxt-link to="/signin" class="btn">{{ signinButtonText }}</nuxt-link>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { tdeiClient } from '~/services/index'

const auth = tdeiClient.auth
const signinButtonText = computed(() => auth.ok ? auth.username : 'Sign In')
</script>

<style>
.app-navbar {

  .navbar-brand {
    display: inline-flex;
  }

  .app-logo {
    width: 2rem;
    margin-right: 0.5rem;
  }
}
</style>
