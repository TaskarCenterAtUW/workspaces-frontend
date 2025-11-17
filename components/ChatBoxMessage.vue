<template>
  <li class="chat-box-message">
    <header>
      <span class="visually-hidden">Comment by</span>
      <span class="fw-bold">
        <app-icon variant="account_circle" />{{ props.user ?? 'Anonymous' }}
      </span>
      <span :title="date">{{ elapsed }}</span>
    </header>
    <blockquote>{{ props.text }}</blockquote>
  </li>
</template>

<script setup lang="ts">
import { formatElapsed, formatShort } from '~/util/time';

interface Props {
  id: PropertyKey;
  text: string;
  user?: string;
  date: Date;
}

const props = defineProps<Props>();
const elapsed = computed(() => formatElapsed(props.date));
const date = computed(() => formatShort(props.date));
</script>

<style lang="scss">
.chat-box-message {
  width: calc(100% - 1rem);
  padding: 0.5rem;
  margin-bottom: 1rem;
  background: var(--bs-light);
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius);
  box-shadow: var(--bs-box-shadow-sm);

  header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  &:last-child {
    margin: 0;
  }

  &.mine {
    background: var(--bs-primary-bg-subtle);
    border-color: var(--bs-primary-border-subtle);
    margin-left: auto;

    header {
      text-align: right;
    }
  }

  blockquote {
    white-space: pre-line;
    margin: 0;
  }
}
</style>
