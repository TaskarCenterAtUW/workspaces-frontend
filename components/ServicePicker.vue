<template>
  <div class="service-picker-wrap">
    <select
      v-model="model"
      class="service-picker form-select"
      aria-label="Service Selection"
    >
      <option
        v-for="s in services"
        :key="s.id"
        :value="s.id"
      >
        {{ s.name }}
      </option>
    </select>
    <small
      v-if="services.length === 0"
      class="form-text text-muted"
    >
      No services available
    </small>
  </div>
</template>

<script setup lang="ts">
import { tdeiUserClient } from '~/services/index'
import type { TdeiService } from '~/types/tdei'

const model = defineModel<string | null | undefined>({ required: true });
const props = defineProps({
  projectGroupId: {
    type: String,
    required: true
  },
  serviceType: {
    type: String,
    default: 'all'
  }
})

const { projectGroupId, serviceType } = toRefs(props);
const services = ref<TdeiService[]>([]);

watch(projectGroupId, _val => refreshServices());
watch(serviceType, _val => refreshServices());

refreshServices();

async function refreshServices() {
  services.value = (await tdeiUserClient.getMyServices(props.projectGroupId, props.serviceType))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedServiceStillExists = services.value.some(s => s.id === model.value)

  if (!selectedServiceStillExists) {
    model.value = services.value[0]?.id ?? null
  }
}
</script>
