<template>
  <app-page class="signin-page">
    <div class="text-center my-5">
      <app-logo />
      <h1>Sign In</h1>
    </div>

    <signin-form />
  </app-page>
</template>

<script setup lang="ts">
import { tdeiAuth } from '~/services/index';

if (tdeiAuth.complete) {
  navigateTo('/dashboard');
}
</script>

<style lang="scss">
.signin-page {
  .app-logo {
    width: 5rem;
    height: 5rem;
    margin-bottom: 1rem;
  }

  .signin-card {
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
  }
}
</style>
