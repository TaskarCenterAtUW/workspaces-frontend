<template>
  <section :class="classes">
    <slot />
  </section>
</template>

<script setup lang="ts">
interface Props {
  fluid?: boolean;
  padding?: 'default' | 'none' | 'sm';
}

const props = withDefaults(defineProps<Props>(), {
  fluid: false,
  padding: 'default',
});

const classes = computed(() => ({
  'py-0': props.padding === 'none',
  'py-3': props.padding === 'sm',
  'py-4': props.padding === 'default',
  'container-fluid': props.fluid === true,
  'container-lg': props.fluid === false,
}));
</script>
