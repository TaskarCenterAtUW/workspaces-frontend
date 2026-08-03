<template>
  <div
    class="area-unit-toggle"
    :class="`area-unit-toggle-${size}`"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="option in AREA_UNIT_OPTIONS"
      :key="option.value"
      class="area-unit-toggle-option"
      :class="{ 'area-unit-toggle-option-active': areaDisplayUnit === option.value }"
      type="button"
      :aria-pressed="areaDisplayUnit === option.value"
      :disabled="disabled"
      @click="areaDisplayUnit = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { AREA_UNIT_OPTIONS, type AreaDisplayUnit } from '~/util/area';

interface Props {
  disabled?: boolean;
  label: string;
  size?: 'sm' | 'md';
}

withDefaults(defineProps<Props>(), {
  disabled: false,
  size: 'sm',
});

const areaDisplayUnit = defineModel<AreaDisplayUnit>({ required: true });
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.area-unit-toggle {
  display: inline-flex;
  padding: 0.15rem;
  background: rgba($text-navy, 0.06);
  border: 1px solid rgba($text-navy, 0.12);
  border-radius: 0.45rem;
}

.area-unit-toggle-option {
  min-width: 2.8rem;
  padding: 0.3rem 0.45rem;
  color: $secondary;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  background: transparent;
  border: 0;
  border-radius: 0.32rem;
}

.area-unit-toggle-md {
  padding: 0.2rem;
  border-radius: 0.55rem;
}

.area-unit-toggle-md .area-unit-toggle-option {
  min-width: 3.25rem;
  padding: 0.35rem 0.55rem;
  font-size: 0.85rem;
  border-radius: 0.4rem;
}

.area-unit-toggle-option:hover:not(:disabled),
.area-unit-toggle-option:focus-visible {
  color: $text-navy;
}

.area-unit-toggle-option:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba($primary, 0.16);
}

.area-unit-toggle-option-active {
  color: $text-navy;
  background: $white;
  box-shadow: $box-shadow-sm;
}
</style>
