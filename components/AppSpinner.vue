<template>
  <div
    :class="classes"
    role="status"
  >
    <span class="visually-hidden">Loading...</span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  size: String,
})

const classes = computed(() => ({
  'spinner-border': true,
  'spinner-border-sm': props.size === 'sm',
  'spinner-border-lg': props.size === 'lg',
}))
</script>
