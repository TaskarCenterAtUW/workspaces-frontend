<template>
  <div
    v-if="visible"
    class="app-confirmation-dialog-backdrop"
    role="presentation"
  >
    <section
      ref="dialogRef"
      class="app-confirmation-dialog"
      :class="`app-confirmation-dialog-theme-${primaryVariant}`"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <button
        class="btn btn-link app-confirmation-dialog-close"
        type="button"
        :disabled="busy"
        aria-label="Close dialog"
        @click="emit('close')"
      >
        <app-icon
          variant="close"
          size="24"
          no-margin
        />
      </button>

      <div class="app-confirmation-dialog-icon-shell">
        <span class="app-confirmation-dialog-icon">
          <app-icon
            variant="info"
            size="22"
            no-margin
          />
        </span>
      </div>

      <h2
        :id="titleId"
        class="app-confirmation-dialog-title"
      >
        {{ title }}
      </h2>

      <p class="app-confirmation-dialog-message">
        {{ message }}
      </p>

      <div class="app-confirmation-dialog-actions">
        <button
          ref="secondaryActionRef"
          class="btn btn-outline-secondary app-confirmation-dialog-secondary"
          type="button"
          :disabled="busy"
          @click="emit('secondary-action')"
        >
          {{ secondaryActionLabel }}
        </button>

        <button
          ref="primaryActionRef"
          class="btn app-confirmation-dialog-primary"
          :class="{
            'app-confirmation-dialog-primary-danger': primaryVariant === 'danger',
            'app-confirmation-dialog-primary-default': primaryVariant === 'primary'
          }"
          type="button"
          :disabled="busy"
          @click="emit('primary-action')"
        >
          <app-spinner
            v-if="busy"
            size="sm"
          />
          <template v-else>
            {{ primaryActionLabel }}
          </template>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
interface Props {
  busy?: boolean;
  message: string;
  primaryActionLabel: string;
  primaryVariant?: 'danger' | 'primary';
  secondaryActionLabel?: string;
  title: string;
  visible: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  busy: false,
  primaryVariant: 'primary',
  secondaryActionLabel: 'No, Cancel',
});

const emit = defineEmits<{
  'close': [];
  'primary-action': [];
  'secondary-action': [];
}>();

const dialogRef = useTemplateRef<HTMLElement>('dialogRef');
const primaryActionRef = useTemplateRef<HTMLButtonElement>('primaryActionRef');
const secondaryActionRef = useTemplateRef<HTMLButtonElement>('secondaryActionRef');
const titleId = useId();
let previouslyFocusedElement: HTMLElement | null = null;

watch(
  () => props.visible,
  async (isVisible) => {
    if (!isVisible) {
      previouslyFocusedElement?.focus();
      previouslyFocusedElement = null;
      return;
    }

    previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
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
    previouslyFocusedElement?.focus();
  }
});

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.busy) {
    emit('close');
    return;
  }

  if (event.key !== 'Tab' || !dialogRef.value) {
    return;
  }

  const focusableElements = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));

  if (focusableElements.length === 0) {
    event.preventDefault();
    dialogRef.value.focus();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements.at(-1);

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement?.focus();
  }
  else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement?.focus();
  }
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.app-confirmation-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background-color: rgba($text-navy, 0.42);
  backdrop-filter: blur(2px);
}

.app-confirmation-dialog {
  position: relative;
  width: min(44rem, 100%);
  display: grid;
  gap: 1rem;
  padding: 2rem 2.15rem 2.05rem;
  background: #ffffff;
  border-radius: 1.15rem;
  box-shadow: 0 1.25rem 3rem rgba($text-navy, 0.18);
}

.app-confirmation-dialog-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  color: rgba($text-navy, 0.72);
  text-decoration: none;
}

.app-confirmation-dialog-icon-shell {
  display: flex;
}

.app-confirmation-dialog-icon {
  width: 4rem;
  height: 4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.app-confirmation-dialog-theme-primary .app-confirmation-dialog-icon {
  color: #4b5f95;
  background: rgba(111, 133, 196, 0.1);
}

.app-confirmation-dialog-theme-danger .app-confirmation-dialog-icon {
  color: $danger-red;
  background: rgba(199, 57, 58, 0.08);
}

.app-confirmation-dialog-title {
  margin: 0;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: clamp(1.9rem, 2.4vw, 2.3rem);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.03em;
}

.app-confirmation-dialog-message {
  margin: 0;
  color: rgba($secondary, 0.98);
  font-size: 1rem;
  line-height: 1.55;
}

.app-confirmation-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 0.4rem;
}

.app-confirmation-dialog-secondary,
.app-confirmation-dialog-primary {
  min-width: 10.5rem;
  min-height: 3.25rem;
  font-size: 1rem;
  font-weight: 700;
  border-radius: 0.5rem;
}

.app-confirmation-dialog-primary-default {
  color: #ffffff;
  background: #4d158d;
  border: 1px solid #4d158d;
}

.app-confirmation-dialog-primary-default:hover,
.app-confirmation-dialog-primary-default:focus-visible {
  color: #ffffff;
  background: #421178;
  border-color: #421178;
}

.app-confirmation-dialog-primary-danger {
  color: #ffffff;
  background: #d64545;
  border: 1px solid #d64545;
}

.app-confirmation-dialog-primary-danger:hover,
.app-confirmation-dialog-primary-danger:focus-visible {
  color: #ffffff;
  background: #bf3636;
  border-color: #bf3636;
}

@include media-breakpoint-down(sm) {
  .app-confirmation-dialog {
    padding: 1.6rem 1.25rem 1.35rem;
  }

  .app-confirmation-dialog-title {
    font-size: 1.75rem;
  }

  .app-confirmation-dialog-actions {
    flex-direction: column;
  }

  .app-confirmation-dialog-secondary,
  .app-confirmation-dialog-primary {
    width: 100%;
  }
}
</style>
