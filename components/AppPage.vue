<template>
  <section :class="classes">
    <slot />
  </section>
</template>

<script setup lang="ts">
const props = defineProps({
  fluid: {
    type: Boolean,
    default: false
  }
});

const classes = computed(() => ({
  'py-4': true,
  'container-fluid': props.fluid === true,
  'container-lg': props.fluid === false
}));
</script>
