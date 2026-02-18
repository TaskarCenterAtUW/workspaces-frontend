<template>
  <b-button
    :variant="props.variant"
    to="/dashboard"
  >
    Return to Dashboard
  </b-button>
</template>

<script setup lang="ts">
import type { BButtonProps } from 'bootstrap-vue-next/types';

interface Props {
  variant?: BButtonProps['variant'];
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
});
</script>
