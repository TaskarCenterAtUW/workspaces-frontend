<template>
  <span class="changes-badge" :class="{ loading: props.loading }">
    <span :class="createClasses">
      {{ props.create }}
      <span class="visually-hidden">elements created</span>
    </span>
    <span :class="modifyClasses">
      {{ props.modify }}
      <span class="visually-hidden">elements modified</span>
    </span>
    <span :class="deleteClasses">
      {{ props.delete }}
      <span class="visually-hidden">elements deleted</span>
    </span>
    <span class="loading-overlay">
      <span class="visually-hidden">Loading&hellip;</span>
    </span>
  </span>
</template>

<script setup lang="ts">
interface Props {
  create: number;
  modify: number;
  delete: number;
  loading: boolean | undefined;
}

const props = defineProps<Props>();

const createClasses = computed(() => ([
  'badge',
  props.create > 0 ? 'bg-create' : undefined
]));
const modifyClasses = computed(() => ([
  'badge',
  props.modify > 0 ? 'bg-modify' : undefined
]));
const deleteClasses = computed(() => ([
  'badge',
  props.delete > 0 ? 'bg-delete' : undefined
]));
</script>

<style lang="scss">
.changes-badge {
  display: flex;
  position: relative;
  color: white;
  background-color: #999999;
  border-radius: var(--bs-border-radius);
  overflow: hidden;
  font-size: 1rem;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);

  &.loading {
    .badge {
      visibility: hidden;
    }
    .loading-overlay {
      display: inline;
    }
  }

  .badge {
    border-radius: 0;
  }

  .loading-overlay {
    display: none;
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: rgba(0, 0, 0, 0.12);
    animation: changes-badge-loading-animation 1s linear infinite;
  }
}

@keyframes changes-badge-loading-animation {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}
</style>
