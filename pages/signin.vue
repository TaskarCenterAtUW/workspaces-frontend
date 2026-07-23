// Test outline
// @test e2e: an already-authenticated visitor is redirected from /signin to /dashboard
// @test e2e: an unauthenticated user is shown the sign-in form when visiting /signin--with a playwright snapshot of the form
// @test e2e: that the toolbar doesn't show a username when the user is not logged in, and does when the user is logged in
// @test e2e: validate that all the API calls used on this page match the Swagger spec (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json) and that success
//            and error states are handled properly with toasts (playwright snapshot these)
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
@import "~/assets/scss/theme.scss";
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

@include media-breakpoint-down(sm) {
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
