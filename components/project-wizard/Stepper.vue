<template>
  <ol
    class="project-wizard-stepper"
    aria-label="Project creation steps"
  >
    <li
      v-for="(step, index) in steps"
      :key="step"
      class="project-wizard-stepper-item"
      :class="{
        'project-wizard-stepper-item-complete': index <= currentIndex
      }"
    >
      <span
        class="project-wizard-stepper-line"
        aria-hidden="true"
      />
      <button
        class="project-wizard-stepper-dot"
        type="button"
        :aria-current="index === currentIndex ? 'step' : undefined"
        :aria-label="`Step ${index + 1}: ${stepLabels[step]}`"
        :disabled="selectionLocked ? index !== currentIndex : index > currentIndex"
        @click="$emit('select', step)"
      >
        <app-icon
          v-if="index <= currentIndex"
          variant="check"
          size="18"
          no-margin
        />
        <span v-else>{{ String(index + 1).padStart(2, '0') }}</span>
      </button>
    </li>
  </ol>
</template>

<script setup lang="ts">
import type { ProjectWizardStepId } from '~/types/project-wizard';

interface Props {
  currentIndex: number;
  selectionLocked?: boolean;
  steps: ProjectWizardStepId[];
}

defineProps<Props>();

const stepLabels: Record<ProjectWizardStepId, string> = {
  details: 'Project Details',
  area: 'Area Of Interest',
  settings: 'Settings',
  review: 'Review',
};

defineEmits<{
  select: [step: ProjectWizardStepId];
}>();
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}

.project-wizard-stepper-item {
  position: relative;
  display: flex;
  justify-content: center;
  flex: 1;
}

.project-wizard-stepper-line {
  position: absolute;
  top: 50%;
  left: calc(50% + 1rem);
  width: calc(100% - 2rem);
  border-top: 1px dashed rgba($secondary, 0.3);
  transform: translateY(-50%);
}

.project-wizard-stepper-item:last-child .project-wizard-stepper-line {
  display: none;
}

.project-wizard-stepper-dot {
  position: relative;
  z-index: 1;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: $secondary;
  font-family: var(--secondary-font-family);
  font-size: 0.85rem;
  font-weight: 600;
  background-color: #fff;
  border: 2px solid rgba($secondary, 0.4);
  border-radius: 999px;
}

.project-wizard-stepper-dot:disabled {
  opacity: 1;
}

.project-wizard-stepper-item-complete .project-wizard-stepper-dot {
  color: #fff;
  background-color: $primary;
  border-color: $primary;
}
</style>
