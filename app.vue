<template>
  <b-app>
    <nuxt-layout>
      <nuxt-page />
    </nuxt-layout>
    <SessionExpiredDialog />
  </b-app>
</template>

<script setup lang="ts">
import SessionExpiredDialog from '~/components/auth/SessionExpiredDialog.vue';
</script>
