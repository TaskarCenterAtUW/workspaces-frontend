<template>
  <section class="review-discussion">
    <header>
      <h4 class="h5">
        Discussion
      </h4>
    </header>

    <app-spinner v-show="loading" />
    <chat-box
      v-show="!loading"
      ref="chat"
      :messages="messages"
      @send="send"
    />
  </section>
</template>

<script setup lang="ts">
import type { ReviewListItem } from '~/services/review';
import { osmClient } from '~/services/index';

import type ChatBox from '~/components/ChatBox.vue';
import type { ChatMessage } from '~/components/ChatBox.vue';
import type { OsmChangeset, OsmNote } from '~/types/osm';

interface Props {
  item: ReviewListItem;
}

const props = defineProps<Props>();

const route = useRoute();
const workspaceId = Number(route.params.id);

const loading = ref(false);
const messages = ref<ChatMessage[]>([]);
const chat = useTemplateRef<InstanceType<typeof ChatBox>>('chat');

refresh();

async function refresh() {
  loading.value = true;

  if (props.item.isChangeset) {
    await refreshChangeset();
  }
  else if (props.item.isNote) {
    refreshNote();
  }

  loading.value = false;
}

async function refreshChangeset() {
  if (!props.item.hasComments) {
    messages.value = [];
    return;
  }

  messages.value = await osmClient.getChangesetComments(workspaceId, props.item.id);
}

function refreshNote() {
  messages.value = noteComments(props.item.data as OsmNote);
}

function noteComments(note: OsmNote): ChatMessage[] {
  return note.comments.map(comment => ({
    id: Symbol(),
    user: comment.user,
    date: comment.date,
    text: comment.text,
  }));
}

async function send(message: string) {
  if (props.item.isChangeset) {
    await sendChangeset(message);
  }
  else if (props.item.isNote) {
    await sendNote(message);
  }

  chat.value?.clear();
}

async function sendChangeset(message: string) {
  await osmClient.postChangesetComment(workspaceId, props.item.id, message);

  // Re-fetch the discussion so the newly posted comment appears. Fetch directly
  // rather than via refreshChangeset(): its hasComments guard reads the
  // changeset's cached comments_count, which is stale right after posting and
  // would short-circuit to an empty list on a first comment.
  messages.value = await osmClient.getChangesetComments(workspaceId, props.item.id);

  // Sync the shared item's cached count so the sidebar/toolbar badges update
  // too — commentCount reads comments_count for changesets. props.item is the
  // reactive review-list entry, so this mutation propagates to those badges.
  (props.item.data as OsmChangeset).comments_count = messages.value.length;
}

async function sendNote(message: string) {
  // The comment endpoint returns the updated note, so refresh straight from it.
  const note = await osmClient.postNoteComment(workspaceId, props.item.id, message);

  if (note) {
    // Sync the shared item's comments so the count badges update too —
    // commentCount reads comments.length for notes.
    (props.item.data as OsmNote).comments = note.comments;
    messages.value = noteComments(note);
  }
}
</script>

<style lang="scss">
@import "assets/scss/theme.scss";

.review-discussion {
  background: var(--bs-body-bg);
  max-width: 25rem;
  max-height: calc(100vh - $navbar-height - 7rem);
  border-radius: var(--bs-border-radius);
  font-size: 0.875em;
  box-shadow: var(--bs-box-shadow);
  overflow: hidden;

  > header {
    padding: 0.5rem;

    h4 {
      margin: 0;
    }
  }

  > .spinner-border {
    display: block;
    margin: 5rem auto;
  }

  .chat-box {
    max-height: calc(100vh - $navbar-height - 7rem - 2.5rem);
  }
}
</style>
