<template>
  <section class="project-wizard-step project-wizard-step-simple">
    <header class="project-wizard-step-header">
      <h2 class="project-wizard-step-title">{{ step.title }}</h2>
      <p class="project-wizard-step-copy">{{ step.description }}</p>
    </header>
  </section>
</template>

<script setup lang="ts">
import type { ProjectWizardTasksStepDefinition } from '~/types/project-wizard';

interface Props {
  step: ProjectWizardTasksStepDefinition;
}

defineProps<Props>();
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-step-simple {
  display: grid;
  gap: 1rem;
}

.project-wizard-step-header {
  display: grid;
  gap: 0.4rem;
}

.project-wizard-step-title {
  margin: 0;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.15;
  text-transform: uppercase;
}

.project-wizard-step-copy {
  margin: 0;
  color: rgba($secondary, 0.95);
  font-size: 0.95rem;
  line-height: 1.45;
}
</style>
