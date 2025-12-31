<template>
  <nav class="app-navbar navbar navbar-expand-md shadow">
    <div class="container-lg">
      <nuxt-link class="navbar-brand" to="/">
        <app-logo />
        <span>TDEI</span>&nbsp;<span>Workspaces</span>
      </nuxt-link>

      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"/>
      </button>

      <div id="navbarSupportedContent" class="collapse navbar-collapse">
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
            <a class="nav-link" href="#">Help</a>
          </li>
        </ul>

        <span class="mx-auto" />

        <nuxt-link v-show="!auth.ok" to="/signin" class="btn">Sign In</nuxt-link>
        <span v-show="auth.ok" class="nav-item dropdown">
          <a id="navbarAccountMenuLink" class="nav-link" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
            <app-icon variant="account_circle" size="24" />{{ auth.displayName }}
          </a>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="navbarAccountMenuLink">
            <li>
              <nuxt-link class="dropdown-item" to="/" @click="auth.clear()">
                <app-icon variant="logout" class="me-3" />Logout
              </nuxt-link>
            </li>
          </ul>
        </span>
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
  .navbar-brand {
    display: inline-flex;
  }

  .app-logo {
    width: 2rem;
    margin-right: 0.5rem;
  }
}
</style>
