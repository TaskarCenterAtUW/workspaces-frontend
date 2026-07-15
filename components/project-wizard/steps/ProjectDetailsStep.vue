<template>
  <section class="project-wizard-step project-wizard-step-details">
    <header class="project-wizard-step-header">
      <h2 class="project-wizard-step-title">{{ step.title }}</h2>
      <p class="project-wizard-step-copy">{{ step.description }}</p>
    </header>

    <label class="project-wizard-field">
      <span class="project-wizard-label">{{ projectNameField?.label }} <span class="text-danger">*</span></span>
      <div
        class="project-wizard-name-row"
        :class="{ 'project-wizard-name-row-status': nameAvailabilityStatus !== 'idle' }"
      >
        <input
          :value="details.name"
          class="form-control"
          type="text"
          :placeholder="projectNameField?.placeholder ?? ''"
          @input="emit('update:field', 'name', ($event.target as HTMLInputElement).value)"
        >
        <span
          v-if="nameAvailabilityStatus !== 'idle'"
          class="project-wizard-availability"
          :class="`project-wizard-availability-${nameAvailabilityStatus}`"
        >
          <app-spinner v-if="nameAvailabilityStatus === 'checking'" size="sm" />
          <img
            v-else-if="availabilityIconSrc"
            :src="availabilityIconSrc"
            class="project-wizard-availability-icon"
            alt=""
          >
          {{ nameAvailabilityMessage }}
        </span>
      </div>
    </label>

    <label class="project-wizard-field">
      <span class="project-wizard-label">{{ descriptionField?.label }}</span>
      <textarea
        :value="details.description"
        class="form-control project-wizard-textarea"
        :rows="descriptionField?.rows ?? 4"
        :placeholder="descriptionField?.placeholder ?? ''"
        @input="emit('update:field', 'description', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <label class="project-wizard-field">
      <span class="project-wizard-label">{{ imageryUrlField?.label }}</span>
      <textarea
        :value="details.imageryUrl"
        class="form-control project-wizard-textarea project-wizard-textarea-code"
        :class="{ 'is-invalid': imageryError }"
        :rows="imageryUrlField?.rows ?? 8"
        :placeholder="imageryUrlField?.placeholder ?? ''"
        :aria-describedby="imageryError ? 'project-wizard-imagery-error' : undefined"
        :aria-invalid="Boolean(imageryError)"
        @input="emit('update:field', 'imageryUrl', ($event.target as HTMLTextAreaElement).value)"
      />
      <p
        v-if="imageryError"
        id="project-wizard-imagery-error"
        class="project-wizard-field-error"
        role="alert"
      >
        {{ imageryError }}
      </p>
      <p v-else-if="imageryValidating" class="project-wizard-field-help" aria-live="polite">
        Validating custom imagery...
      </p>
    </label>
  </section>
</template>

<script setup lang="ts">
import checkCircleIcon from '~/assets/img/check-circle.svg';
import closeCircleIcon from '~/assets/img/close-circle.svg';

import type {
  ProjectWizardDetailsDraft,
  ProjectWizardDetailsFieldDefinition,
  ProjectWizardDetailsFieldId,
  ProjectWizardDetailsStepDefinition,
  ProjectWizardNameAvailabilityStatus,
} from '~/types/project-wizard';

interface Props {
  details: ProjectWizardDetailsDraft;
  imageryError: string | null;
  imageryValidating: boolean;
  nameAvailabilityMessage: string;
  nameAvailabilityStatus: ProjectWizardNameAvailabilityStatus;
  step: ProjectWizardDetailsStepDefinition;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:field': [fieldId: ProjectWizardDetailsFieldId, value: string];
}>();

const detailsFields = computed(() => props.step.content.fields);
const projectNameField = computed(() => findField('name'));
const descriptionField = computed(() => findField('description'));
const imageryUrlField = computed(() => findField('imageryUrl'));

const availabilityIconSrc = computed(() => {
  switch (props.nameAvailabilityStatus) {
    case 'available':
      return checkCircleIcon;
    case 'unavailable':
      return closeCircleIcon;
    default:
      return '';
  }
});

function findField(fieldId: ProjectWizardDetailsFieldId): ProjectWizardDetailsFieldDefinition | undefined {
  return detailsFields.value.find(field => field.id === fieldId);
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-step-details {
  display: grid;
  gap: 1.35rem;
}

.project-wizard-step-header {
  display: grid;
  gap: 0.25rem;
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

.project-wizard-field {
  display: grid;
  gap: 0.55rem;
}

.project-wizard-label {
  font-weight: 600;
}

.project-wizard-name-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.project-wizard-name-row-status {
  grid-template-columns: minmax(0, 1fr) auto;
}

.project-wizard-availability {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.75rem 0.9rem;
  color: $secondary;
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  border: 1px solid rgba($text-navy, 0.14);
  border-left: 0;
  border-radius: 0 0.35rem 0.35rem 0;
}

.project-wizard-availability-available {
  color: #196f55;
  border-color: rgba(25, 111, 85, 0.24);
}

.project-wizard-availability-unavailable {
  color: #c7393a;
  border-color: rgba(199, 57, 58, 0.24);
}

.project-wizard-name-row .form-control {
  border-radius: 0.35rem 0 0 0.35rem;
}

.project-wizard-name-row:not(.project-wizard-name-row-status) .form-control {
  border-radius: 0.35rem;
}

.project-wizard-availability-icon {
  width: 1rem;
  height: 1rem;
  display: block;
}

.project-wizard-textarea {
  resize: vertical;
}

.project-wizard-textarea-code {
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace;
  font-size: 0.92rem;
}

.project-wizard-field-error,
.project-wizard-field-help {
  margin: 0;
  font-size: 0.85rem;
}

.project-wizard-field-error {
  color: #c7393a;
}

.project-wizard-field-help {
  color: $secondary;
}
</style>
