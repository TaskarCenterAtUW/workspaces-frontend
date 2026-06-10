<template>
  <div
    ref="rootRef"
    class="tdei-select"
    :class="{ 'tdei-select-open': isOpen, 'tdei-select-disabled': disabled }"
    @focusout="onFocusOut"
  >
    <button
      :id="id"
      class="tdei-select-toggle"
      type="button"
      :disabled="disabled"
      :aria-expanded="isOpen"
      :aria-label="ariaLabel"
      @click="toggleOpen"
      @keydown="onKeydown"
    >
      <span class="tdei-select-value">
        {{ selectedLabel }}
      </span>
      <app-icon :variant="isOpen ? 'expand_less' : 'expand_more'" size="20" no-margin />
    </button>

    <div
      v-if="isOpen"
      class="tdei-select-menu"
      @mousedown.prevent
    >
      <button
        v-for="(option, index) in options"
        :key="String(option.value)"
        class="tdei-select-option"
        :class="{
          'tdei-select-option-active': index === activeIndex,
          'tdei-select-option-selected': option.value === model,
        }"
        type="button"
        @click="selectOption(option.value)"
        @mouseenter="activeIndex = index"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface AppSelectOption {
  label: string;
  value: string | number;
}

interface Props {
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  options: AppSelectOption[];
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: undefined,
  disabled: false,
  id: undefined,
  placeholder: '',
});

const model = defineModel<string | number | null>({ required: true });

const rootRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const activeIndex = ref(-1);

const selectedOption = computed(() =>
  props.options.find(option => option.value === model.value),
);

const selectedLabel = computed(() =>
  selectedOption.value?.label ?? props.placeholder,
);

watch(isOpen, (open) => {
  if (!open) {
    activeIndex.value = -1;
    return;
  }

  const selectedIndex = props.options.findIndex(option => option.value === model.value);
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : 0;
});

function toggleOpen() {
  if (props.disabled) {
    return;
  }

  isOpen.value = !isOpen.value;
}

function closeMenu() {
  isOpen.value = false;
}

function selectOption(value: string | number) {
  model.value = value;
  closeMenu();
}

function onFocusOut(event: FocusEvent) {
  if (!rootRef.value?.contains(event.relatedTarget as Node | null)) {
    closeMenu();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) {
    return;
  }

  if (!isOpen.value && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault();
    isOpen.value = true;
    return;
  }

  if (!isOpen.value) {
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, props.options.length - 1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const option = props.options[activeIndex.value];
    if (option) {
      selectOption(option.value);
    }
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu();
  }
}
</script>
