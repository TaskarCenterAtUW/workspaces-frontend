<template>
  <section class="review-changeset-details">
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
import { formatShort } from '~/util/time';

const props = defineProps({
  changeset: {
    type: Object,
    required: true
  }
});

const metadata = computed(() => ({
  comment: props.changeset.tags?.comment,
  created_by: props.changeset.tags?.created_by,
  imagery_used: props.changeset.tags?.imagery_used,
  user: props.changeset.user,
  uid: props.changeset.uid,
  created_at: formatShort(props.changeset.created_at),
  closed_at: formatShort(props.changeset.closed_at)
}));
</script>

<style lang="scss">
@import "assets/scss/theme.scss";

.review-changeset-details {
  position: absolute;
  top: 5.5rem;
  left: 1rem;
  background: var(--bs-body-bg);
  max-width: calc(100% - 1.5rem);
  max-height: calc(90vh - $navbar-height - 6rem);
  border-radius: var(--bs-border-radius);
  overflow: auto;
  font-size: 0.875em;
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
