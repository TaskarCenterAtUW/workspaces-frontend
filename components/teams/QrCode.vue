<template>
  <div>
    <qr-code
      class="d-block mx-auto mb-3 border rounded-3"
      type="image/png"
      :width="256"
      :color="{ dark: '#000000ff', light: '#ffffffff' }"
      :value="joinUrl"
      @change="onChange"
    />
    <div class="text-center">
      <small>Share this link:</small>
    </div>
    <div class="text-center">
      <nuxt-link :to="joinRoute">{{ joinUrl }}</nuxt-link>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  workspaceId: number;
  teamId: number;
}

const props = defineProps<Props>();
const emit = defineEmits(['change']);
const joinRoute = computed(() => `/workspace/${props.workspaceId}/teams/${props.teamId}`);
const joinUrl = computed(() => `${window.location.origin}${joinRoute.value}`);

function onChange(dataUrl: string) {
  emit('change', dataUrl);
}
</script>
