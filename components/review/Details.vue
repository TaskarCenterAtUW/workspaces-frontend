<template>
  <section class="review-details">
    <header>
      <h4 class="h5">Details</h4>
    </header>

    <table class="table table-sm table-striped">
      <tbody>
        <tr v-for="(value, key) in metadata" :key="key">
          <th>{{ key }}</th>
          <td>{{ value}}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { ReviewListItem } from '~/services/review';
import { formatShort } from '~/util/time';

import type { OsmChangeset, OsmNote } from '~/types/osm';
import type { TdeiFeedback } from '~/types/tdei';

interface Props {
  item: ReviewListItem;
}

const props = defineProps<Props>();

const getChangesetMetadata = (changeset: OsmChangeset) => ({
  'Comment': changeset.tags?.comment,
  'Editor': changeset.tags?.created_by,
  'Source': changeset.tags?.source,
  'Imagery': changeset.tags?.imagery_used,
  'Created By': changeset.user,
  'User ID': changeset.uid,
  'Created At': formatShort(changeset.created_at),
  'Closed At': formatShort(changeset.closed_at)
});
const getFeedbackMetadata = (feedback: TdeiFeedback) => ({
  'TDEI Dataset': feedback.dataset?.name,
  'TDEI Project Group': feedback.project_group?.name,
  'Contact E-mail Address': feedback.customer_email,
  'Due Date': formatShort(feedback.due_date),
  'Created At': formatShort(feedback.created_at),
  'Updated At': formatShort(feedback.updated_at),
  'Status': feedback.status,
  'Resolution Status': feedback.resolution_status,
  'Resolution': feedback.resolution_description,
  'Resolved By': feedback.resolved_by
});
const getNoteMetadata = (note: OsmNote) => ({
  'Created By': note.comments[0]?.user ?? 'Anonymous',
  'Created At': formatShort(note.created_at),
  'Status': note.status,
});
const metadata = computed(() => {
  if (props.item.isChangeset) {
    return getChangesetMetadata(props.item.data as OsmChangeset);
  }
  if (props.item.isFeedback) {
    return getFeedbackMetadata(props.item.data as TdeiFeedback);
  }
  if (props.item.isNote) {
    return getNoteMetadata(props.item.data as OsmNote);
  }

  return { }
});
</script>

<style lang="scss">
.review-details {
  background: var(--bs-body-bg);
  border-radius: var(--bs-border-radius);
  font-size: 0.875em;
  overflow: hidden;
  box-shadow: var(--bs-box-shadow);

  header {
    padding: 0.5rem;
  }

  table, h4 {
    margin: 0;
  }

  th, td {
    padding: 0.25em 0.5em;
  }
}
</style>
