<template>
  <i :class="classes" />
</template>

<script setup lang="ts">
const props = defineProps({
  variant: {
    type: String,
    required: true
  },
  size: {
    type: [Number, String],
    default: 18
  }
})

const classes = computed(() => ([
  'material-icons',
  `md-${props.size}`,
  `md-${props.variant}`
]))
</script>

<style>
.material-icons {
  vertical-align: middle;
  margin-top: -3px;
}
</style>
