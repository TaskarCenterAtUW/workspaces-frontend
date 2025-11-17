<template>
  <section class="diff-attributes">
    <header>
      <app-icon :variant="elementIcon" />{{ elementType }}
      <strong>#{{ elementId }}</strong>
      {{ elementAction }} by
      <strong>{{ props.diff.new.user }}</strong>
    </header>

    <div class="metadata-table-wrapper">
      <table class="table table-sm table-striped">
        <thead>
          <tr>
            <th></th>
            <th v-if="props.diff.old">Previous</th>
            <th>Current</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(value, key) in metadataDiff" :key="key">
            <th>{{ key }}</th>
            <td v-if="props.diff.old">{{ value.old }}</td>
            <td>{{ value.new }}</td>
          </tr>
        </tbody>
      </table>
    </div><!-- .metadata-table-wrapper -->

    <div class="tag-table-wrapper">
      <table class="table table-sm table-striped">
        <thead>
          <tr>
            <th></th>
            <th colspan="2">Attribute</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[key, vals] in tagDiff" :key="key" :class="tagClass(vals)">
            <th v-if="!vals.new">-</th>
            <th v-else-if="!vals.old">+</th>
            <th v-else-if="vals.new !== vals.old">~</th>
            <th v-else></th>
            <th>{{ key }}</th>
            <td>=</td>
            <td v-if="!vals.new">{{ vals.old }}</td>
            <td v-else-if="!vals.old || vals.old === vals.new">{{ vals.new }}</td>
            <td v-else>
              <span class="text-delete">{{ vals.old }}</span>
              &rarr;
              <span class="text-create">{{ vals.new }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div><!-- .tag-table-wrapper -->
  </section>
</template>

<script lang="ts">
const displayTypeMap = {
  'osw': {
    'node': 'Node',
    'way': 'Edge',
    'relation': 'Relation'
  },
  'pathways': {
    'node': 'Stop',
    'way': 'Pathway',
    'relation': 'Relation'
  }
};

const displayActionMap = {
  'create': 'created',
  'modify': 'modified',
  'delete': 'deleted'
}

const elementIconMap = {
  'create': 'add_circle_outline',
  'modify': 'change_circle',
  'delete': 'cancel'
}

interface TagMapItem {
  old: string | undefined
  new: string | undefined
}

class TagMap {
  #map: Map<string, TagMapItem>;

  constructor() {
    this.#map = new Map();
  }

  getTag(tag: string) {
    let entry = this.#map.get(tag);

    if (!entry) {
      entry = { old: '', new: '' };
      this.#map.set(tag, entry);
    }

    return entry;
  }

  toArray() {
    return [...this.#map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }
}
</script>

<script setup lang="ts">
import { formatShort } from '~/util/time';
import type { AdiffAction } from '~/types/adiff';
import type { WorkspaceType } from '~/types/workspaces';

interface Props {
  datasetType: WorkspaceType;
  diff: AdiffAction;
}

const props = defineProps<Props>();

const elementId = computed(() => props.diff.new?.id ?? props.diff.old?.id);
const elementType = computed(() => {
  const map = displayTypeMap[props.datasetType] ?? displayTypeMap.osw;
  const featureType = props.diff.new?.type ?? props.diff.old?.type

  return map[featureType];
});
const elementAction = computed(() => displayActionMap[props.diff.type]);
const elementIcon = computed(() => elementIconMap[props.diff.type]);

const metadataDiff = computed(() => ({
  version: {
    old: props.diff.old?.version,
    new: props.diff.new.version
  },
  timestamp: {
    old: props.diff.old ? formatShort(new Date(props.diff.old.timestamp)) : undefined,
    new: formatShort(new Date(props.diff.new.timestamp))
  },
  changeset: {
    old: props.diff.old?.changeset,
    new: props.diff.new.changeset
  },
  username: {
    old: props.diff.old?.user,
    new: props.diff.new.user
  }
}));

const tagDiff = computed(() => {
  const tagMap = new TagMap();

  if (props.diff.old) {
    for (const key in props.diff.old.tags) {
      tagMap.getTag(key).old = props.diff.old.tags[key];
    }
  }

  for (const key in props.diff.new.tags) {
    tagMap.getTag(key).new = props.diff.new.tags[key];
  }

  return tagMap.toArray();
});

function tagClass(vals: TagMapItem) {
  if (!vals.old) {
    return 'table-success';
  }
  if (!vals.new) {
    return 'table-danger';
  }
  if (vals.old !== vals.new) {
    return 'table-warning';
  }
}
</script>

<style lang="scss">
@import "assets/scss/theme.scss";

.diff-attributes {
  position: absolute;
  min-width: 25rem;
  max-width: 50%;
  bottom: 2rem;
  right: 0.6rem;
  overflow: hidden;
  font-size: 0.875em;

  > * {
    background: var(--bs-body-bg);
    box-shadow: var(--bs-box-shadow);
    border-radius: var(--bs-border-radius);
    margin-bottom: 0.5rem;
  }

  header {
    padding: 0.25em 0.5em;
  }

  table {
    margin: 0;
  }

  tbody th {
    font-weight: normal;
  }

  th, td {
    line-height: 1;
  }

  th:first-child {
    padding-left: 0.5em;
  }

  .metadata-table-wrapper,
  .tag-table-wrapper {
    max-height: calc(70vh - $navbar-height - 5rem);
    overflow: auto;
  }

  .metadata-table-wrapper th:first-child {
    text-transform: capitalize;
  }

  .tag-table-wrapper tbody {
    font-family: monospace;
  }

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
}
</style>
