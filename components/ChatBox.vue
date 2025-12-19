<template>
  <div class="chat-box">
    <div v-if="!props.messages?.length" class="empty-notice">
      <app-icon variant="chat" size="36" />
      <span>{{ props.emptyText }}</span>
    </div>
    <ul v-else class="message-list">
      <chat-box-message
        v-for="message in props.messages"
        :key="message.id"
        v-bind="message"
      />
    </ul>

    <form class="input-group" @submit.prevent="send">
      <label class="flex-grow-1">
        <span class="visually-hidden">Message</span>
        <textarea
          v-model="draft"
          class="form-control"
          placeholder="Type your message here"
        />
      </label>
      <button type="submit" class="btn btn-light border" title="Send">
        <app-icon variant="send" no-margin/>
        <span class="visually-hidden">Post Comment</span>
      </button>
    </form>
  </div>
</template>

<script lang="ts">
export interface ChatMessage {
  id: PropertyKey,
  date: Date;
  user?: string;
  text: string;
}
</script>

<script setup lang="ts">

interface Props {
  messages: Array<ChatMessage>;
  emptyText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  emptyText: 'Start a discussion…'
});

defineExpose({ clear });

const emit = defineEmits(['send']);
const draft = ref('');

function send() {
  emit('send', draft.value);
}

function clear() {
  draft.value = '';
}
</script>

<style lang="scss">
.chat-box {
  display: flex;
  flex-direction: column;

  .message-list {
    list-style-type: none;
    padding: 1rem;
    margin: 0;
    max-height: 30rem;
    overflow: auto;
  }

  .empty-notice {
    text-align: center;
    padding: 5rem 1rem;
    font-size: 1.5em;
    font-weight: 300;

    i {
      opacity: 0.4;
    }
    span {
      opacity: 0.65;
    }
  }

  .message-list,
  .empty-notice {
    border-top: 1px solid var(--bs-border-color);
    box-shadow: inset 0 0px 0.5rem rgba(0, 0, 0, 0.075);
  }

  .input-group {
    * {
      border-radius: 0;
    }

    textarea {
      &:focus {
        box-shadow: none;
      }
    }
  }
}
</style>
