<template>
  <b-modal
    ref="modalRef"
    v-model="visible"
    title="Workspace creation initiated"
    centered
    no-header-close
    no-close-on-backdrop
    no-close-on-esc
  >
    <p>
      We’re setting up your workspace and loading your dataset. You can leave this page. It will
      show as <strong>Ready</strong> when setup is complete. Use the Refresh button on the
      dashboard to get the latest status.
    </p>

    <template #footer>
      <nuxt-link
        class="btn btn-primary"
        :to="`/dashboard?workspace=${workspaceId}`"
      >
        Go to Dashboard
      </nuxt-link>
    </template>
  </b-modal>
</template>

<script setup lang="ts">
import type { WorkspaceId } from '~/types/workspaces';

const visible = defineModel<boolean>({ default: false });

defineProps<{
  workspaceId?: WorkspaceId;
}>();

const modalRef = ref<any>(null);

function show() {
  visible.value = true;
  modalRef.value?.show?.();
}

function hide() {
  visible.value = false;
  modalRef.value?.hide?.();
}

defineExpose({
  show,
  hide
});
</script>
