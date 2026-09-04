<template>
  <section
    class="container py-5"
    aria-live="polite"
  >
    <p class="text-center text-muted">
      Restoring your session...
    </p>
  </section>
</template>

<script setup lang="ts">
import { openSessionReauthentication } from '~/services/auth-session';
import { tdeiClient } from '~/services';

// This page stays synchronous so the recovery dialog can mount immediately.
openSessionReauthentication(tdeiClient.auth.username);
</script>
