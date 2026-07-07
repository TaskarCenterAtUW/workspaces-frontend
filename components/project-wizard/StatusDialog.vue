<template>
  <div
    v-if="visible"
    class="project-wizard-status-dialog-backdrop"
    role="presentation"
  >
    <section
      ref="dialogRef"
      class="project-wizard-status-dialog"
      :class="`project-wizard-status-dialog-${variant}`"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
    >
      <button
        class="btn btn-link project-wizard-status-dialog-close"
        type="button"
        aria-label="Close dialog"
        @click="emit('close')"
      >
        <app-icon variant="close" size="24" no-margin />
      </button>

      <div class="project-wizard-status-dialog-icon-shell">
        <span class="project-wizard-status-dialog-icon">
          <app-icon
            :variant="variant === 'success' ? 'check_circle' : 'error'"
            size="22"
            no-margin
          />
        </span>
      </div>

      <h2 :id="titleId" class="project-wizard-status-dialog-title">
        {{ title }}
      </h2>

      <p class="project-wizard-status-dialog-message">
        {{ message }}
      </p>

      <div class="project-wizard-status-dialog-actions">
        <button
          v-if="secondaryActionLabel"
          ref="secondaryActionRef"
          class="btn btn-outline-secondary project-wizard-status-dialog-secondary"
          type="button"
          @click="emit('secondary-action')"
        >
          {{ secondaryActionLabel }}
        </button>

        <button
          ref="primaryActionRef"
          class="btn btn-primary project-wizard-status-dialog-primary"
          type="button"
          @click="emit('primary-action')"
        >
          {{ primaryActionLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
interface Props {
  message: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  title: string;
  variant: 'error' | 'success';
  visible: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
  'primary-action': [];
  'secondary-action': [];
}>();

const dialogRef = useTemplateRef<HTMLElement>('dialogRef');
const primaryActionRef = useTemplateRef<HTMLButtonElement>('primaryActionRef');
const secondaryActionRef = useTemplateRef<HTMLButtonElement>('secondaryActionRef');
const titleId = 'project-wizard-status-dialog-title';

watch(
  () => props.visible,
  async (isVisible) => {
    if (!isVisible) {
      return;
    }

    await nextTick();
    (secondaryActionRef.value ?? primaryActionRef.value ?? dialogRef.value)?.focus();
  },
);

watch(
  () => props.visible,
  (isVisible) => {
    if (!import.meta.client) {
      return;
    }

    if (isVisible) {
      window.addEventListener('keydown', handleWindowKeydown);
      return;
    }

    window.removeEventListener('keydown', handleWindowKeydown);
  },
);

onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('keydown', handleWindowKeydown);
  }
});

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close');
  }
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-status-dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background-color: rgba($text-navy, 0.42);
  backdrop-filter: blur(2px);
}

.project-wizard-status-dialog {
  position: relative;
  width: min(35.5rem, 100%);
  max-height: min(100%, 42rem);
  display: grid;
  gap: 1rem;
  padding: 1.7rem 1.95rem 1.95rem;
  background-color: #fff;
  border-radius: 1rem;
  box-shadow: 0 1rem 2.5rem rgba($text-navy, 0.18);
  overflow: auto;
}

.project-wizard-status-dialog-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  color: rgba($text-navy, 0.74);
  text-decoration: none;
}

.project-wizard-status-dialog-icon-shell {
  display: flex;
}

.project-wizard-status-dialog-icon {
  width: 3.6rem;
  height: 3.6rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.project-wizard-status-dialog-success .project-wizard-status-dialog-icon {
  color: #0e7b63;
  background-color: rgba(14, 123, 99, 0.08);
}

.project-wizard-status-dialog-error .project-wizard-status-dialog-icon {
  color: $danger-red;
  background-color: rgba(199, 57, 58, 0.08);
}

.project-wizard-status-dialog-title {
  margin: 0;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
}

.project-wizard-status-dialog-message {
  margin: 0;
  color: rgba($secondary, 0.98);
  font-size: 1rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.project-wizard-status-dialog-actions {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding-top: 0.35rem;
}

.project-wizard-status-dialog-secondary,
.project-wizard-status-dialog-primary {
  min-width: 10.25rem;
  min-height: 3.1rem;
}

@include media-breakpoint-down(sm) {
  .project-wizard-status-dialog {
    padding: 1.4rem 1.2rem 1.3rem;
  }

  .project-wizard-status-dialog-title {
    font-size: 1.7rem;
  }

  .project-wizard-status-dialog-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .project-wizard-status-dialog-secondary,
  .project-wizard-status-dialog-primary {
    width: 100%;
  }
}
</style>
