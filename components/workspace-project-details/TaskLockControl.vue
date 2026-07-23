<template>
  <div
    ref="rootRef"
    class="project-detail-task-lock-control"
  >
    <button
      v-if="canUnlock"
      class="project-detail-task-lock-button"
      type="button"
      :disabled="busy"
      :aria-expanded="menuOpen ? 'true' : 'false'"
      aria-haspopup="menu"
      @click="toggleMenu"
    >
      <app-icon
        variant="lock"
        size="16"
        no-margin
      />
      <app-icon
        :variant="menuOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
        size="16"
        no-margin
      />
    </button>

    <span
      v-else
      class="project-detail-task-lock-indicator"
      :title="lockedByTitle"
    >
      <app-icon
        variant="lock"
        size="16"
        no-margin
      />
    </span>

    <div
      v-if="canUnlock && menuOpen"
      class="project-detail-task-lock-menu"
      role="menu"
    >
      <button
        class="project-detail-task-lock-menu-item"
        type="button"
        role="menuitem"
        :disabled="busy"
        @click="handleUnlock"
      >
        Unlock task
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Small row-level lock indicator / unlock menu.
 * This stays presentational: it only exposes an `unlock` event and leaves the actual API
 * mutation to the parent page so task state remains centralized.
 */
interface Props {
  busy?: boolean;
  canUnlock: boolean;
  lockedByName?: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  unlock: [];
}>();

const rootRef = useTemplateRef<HTMLDivElement>('rootRef');
const menuOpen = ref(false);

const lockedByTitle = computed(() =>
  props.lockedByName ? `Locked by ${props.lockedByName}` : 'Task is locked',
);

watch(
  () => props.busy,
  (isBusy) => {
    if (isBusy) {
      menuOpen.value = false;
    }
  },
);

onMounted(() => {
  if (!import.meta.client) {
    return;
  }

  window.addEventListener('pointerdown', handleWindowPointerDown);
});

onBeforeUnmount(() => {
  if (!import.meta.client) {
    return;
  }

  window.removeEventListener('pointerdown', handleWindowPointerDown);
});

function toggleMenu() {
  if (props.busy) {
    return;
  }

  menuOpen.value = !menuOpen.value;
}

function handleUnlock() {
  menuOpen.value = false;
  emit('unlock');
}

function handleWindowPointerDown(event: PointerEvent) {
  if (!menuOpen.value || !rootRef.value) {
    return;
  }

  if (rootRef.value.contains(event.target as Node)) {
    return;
  }

  menuOpen.value = false;
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-detail-task-lock-control {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.project-detail-task-lock-button,
.project-detail-task-lock-indicator {
  min-width: 2.15rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.05rem;
  color: #d94f4f;
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.14);
  border-radius: 0.45rem;
}

.project-detail-task-lock-button:disabled {
  opacity: 0.55;
}

.project-detail-task-lock-menu {
  position: absolute;
  left: 0;
  top: calc(100% + 0.45rem);
  z-index: 4;
  min-width: 10.25rem;
  padding: 0.35rem 0;
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.12);
  border-radius: 0.5rem;
  box-shadow: 0 0.75rem 1.6rem rgba($text-navy, 0.14);
}

.project-detail-task-lock-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 0.65rem 0.9rem;
  color: #4a5170;
  font-size: 0.95rem;
  text-align: left;
  background: transparent;
  border: 0;
}

.project-detail-task-lock-menu-item:hover:not(:disabled),
.project-detail-task-lock-menu-item:focus-visible:not(:disabled) {
  background: #f7f8fc;
}

.project-detail-task-lock-menu-item:disabled {
  opacity: 0.55;
}
</style>
