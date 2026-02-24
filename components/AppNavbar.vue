<template>
  <nav class="app-navbar navbar navbar-expand-md shadow">
    <div class="container-lg">
      <nuxt-link class="navbar-brand" to="/">
        <app-logo />
        <span>TDEI</span>&nbsp;<span>Workspaces</span>
      </nuxt-link>

      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="navbarSupportedContent">
        <ul v-show="auth.ok" class="navbar-nav me-auto mb-2 mb-lg-0">
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
            <nuxt-link class="nav-link" to="/help">Help</nuxt-link>
          </li>
        </ul>

        <span class="mx-auto" />

        <nuxt-link v-show="!auth.ok" to="/signin" class="btn">Sign In</nuxt-link>
        <b-dropdown
          v-show="auth.ok"
          class="nav-item"
          placement="bottom-end"
          :variant="null"
          is-nav
          no-caret
        >
          <template #button-content>
            <app-icon variant="account_circle" size="24" />{{ auth.displayName }}
          </template>
          <b-dropdown-item to="/" @click="auth.clear()">
            <app-icon variant="logout" class="me-3" />Logout
          </b-dropdown-item>
        </b-dropdown>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { tdeiClient } from '~/services/index'

const auth = tdeiClient.auth
</script>

<style>
.app-navbar {
  z-index: 900;

  .navbar-brand {
    display: inline-flex;
  }

  .app-logo {
    width: 2rem;
    margin-right: 0.5rem;
  }
}
</style>
