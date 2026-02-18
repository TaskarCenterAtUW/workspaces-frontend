<template>
  <nuxt-link
    class="list-group-item"
    :class="{ active }"
    :to="to"
  >
    <app-icon :variant="props.icon" />
    <slot />
  </nuxt-link>
</template>

<script setup lang="ts">
import type { Workspace } from '~/types/workspaces';

interface Props {
  to: string;
  icon: string;
}

const props = defineProps<Props>();
const route = useRoute();

const workspace = inject<Workspace>('workspace')!;
const to = computed(() => `/workspace/${workspace.id}/settings${props.to}`);

const active = computed(() =>
  (route.path.endsWith('/settings') && to.value.endsWith('/settings'))
  || (!to.value.endsWith('/settings') && route.path.startsWith(to.value)));
</script>
