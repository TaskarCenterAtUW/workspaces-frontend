<template>
  <select
    v-model="model"
    class="service-picker form-select"
    aria-label="Service Selection"
  >
    <option v-for="s in services" :key="s.id" :value="s.id">
      {{ s.name }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { tdeiUserClient } from '~/services/index'

const model = defineModel({ required: true });
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
const services = ref([]);

watch(projectGroupId, (val) => refreshServices());
watch(serviceType, (val) => refreshServices());

refreshServices();

async function refreshServices() {
  services.value = (await tdeiUserClient.getMyServices(props.projectGroupId, props.serviceType))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!model.value && services.length > 0) {
    model.value = services[0].id
  }
}

</script>

