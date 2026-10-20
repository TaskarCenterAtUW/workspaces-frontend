<template>
  <div class="conflation-tag-diff">
    <table class="table table-sm table-striped">
      <thead>
        <tr>
          <th />
          <th colspan="2">
            Attribute
          </th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.key"
          :class="ROW_CLASSES[row.change]"
        >
          <th>{{ MARKERS[row.change] }}</th>
          <th>{{ row.key }}</th>
          <td>=</td>
          <td v-if="row.change === 'modify'">
            <span class="text-delete">{{ row.old }}</span>
            &rarr;
            <span class="text-create">{{ row.new }}</span>
          </td>
          <td v-else>
            {{ row.change === 'delete' ? row.old : row.new }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
// @test unit: rows are the union of the before and after keys, sorted, marked + (added), - (removed), ~ (changed, old → new) or blank (unchanged)

/**
 * A feature's tags before and after a change, as a diff table: the same look
 * as the review page's attribute diff (components/review/AttributeDiff.vue).
 */
const props = defineProps<{
  before: Record<string, string>;
  after: Record<string, string>;
}>();

type Change = 'create' | 'delete' | 'modify' | 'same';
const MARKERS: Record<Change, string> = { create: '+', delete: '-', modify: '~', same: '' };
const ROW_CLASSES: Record<Change, string | undefined> = {
  create: 'table-success', delete: 'table-danger', modify: 'table-warning', same: undefined
};

const rows = computed(() => {
  const keys = [...new Set([...Object.keys(props.before), ...Object.keys(props.after)])].sort((a, b) => a.localeCompare(b));
  return keys.map((key) => {
    const old = props.before[key];
    const next = props.after[key];
    let change: Change = 'same';
    if (old === undefined) change = 'create';
    else if (next === undefined) change = 'delete';
    else if (old !== next) change = 'modify';
    return { key, old, new: next, change };
  });
});
</script>

<style lang="scss" scoped>
@import "assets/scss/theme.scss";

.conflation-tag-diff {
  overflow-x: auto;
  font-size: 0.8rem;
}

table {
  margin: 0;
}

tbody {
  font-family: monospace;
}

tbody th {
  font-weight: normal;
}

th,
td {
  line-height: 1;
  overflow-wrap: anywhere;
}

/* The review page's create / modify / delete colours (see AttributeDiff.vue) */
.table-success {
  --bs-table-bg: #{lighten($review-create-color, 35%)};
  --bs-table-striped-bg: #{lighten($review-create-color, 31%)};
  --bs-table-border-color: #{lighten($review-create-color, 20%)};
  --bs-table-color: #{darken($review-create-color, 32%)};
  --bs-table-striped-color: #{darken($review-create-color, 30%)};
}

.table-warning {
  --bs-table-bg: #{lighten($review-modify-color, 46%)};
  --bs-table-striped-bg: #{lighten($review-modify-color, 43%)};
  --bs-table-border-color: #{lighten($review-modify-color, 30%)};
  --bs-table-color: #{darken($review-modify-color, 22%)};
  --bs-table-striped-color: #{darken($review-modify-color, 20%)};
}

.table-danger {
  --bs-table-bg: #{lighten($review-delete-color, 40%)};
  --bs-table-striped-bg: #{lighten($review-delete-color, 35%)};
  --bs-table-border-color: #{lighten($review-delete-color, 32%)};
  --bs-table-color: #{darken($review-delete-color, 10%)};
  --bs-table-striped-color: #{darken($review-delete-color, 15%)};
}
</style>
