<template>
  <section class="logout-callback-page">
    <div
      class="text-center"
      aria-live="polite"
    >
      <b-spinner label="Signing out" />
      <h1 class="mt-3">Signing you out...</h1>
    </div>
  </section>
</template>

<script setup lang="ts">
import { tdeiClient } from '~/services/index';

onMounted(() => {
  tdeiClient.logout();
  window.location.replace('/signin');
});
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.logout-callback-page {
  min-height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-navy;

  h1 {
    font-size: 1.625rem;
    font-weight: 300;
  }
}
</style>
