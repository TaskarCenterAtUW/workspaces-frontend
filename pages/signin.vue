<template>
  <section class="signin-page">
    <div class="signin-shell">
      <signin-form />
    </div>
  </section>
</template>

<script setup lang="ts">
import { tdeiAuth } from '~/services/index'

if (tdeiAuth.complete) {
  navigateTo('/dashboard')
}
</script>

<style lang="scss">
.signin-page {
  min-height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem 3rem;
  background-image: url('~/assets/img/bg_login.png');
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center top;

  .signin-shell {
    width: 100%;
    max-width: 450px;
  }
}

@media only screen and (max-width: 600px) {
  .signin-page {
    min-height: calc(100vh - 60px);
    padding: 0 0 2rem;
    align-items: center;

    .signin-shell {
      max-width: 100%;
    }
  }
}
</style>
