<template>
  <div class="table-responsive">
    <b-table-simple
      small
      bordered
      class="mb-0"
    >
      <b-thead head-variant="light">
        <b-tr>
          <b-th>Key</b-th>
          <b-th class="text-danger">A</b-th>
          <b-th class="text-primary">B</b-th>
          <b-th class="resolved-column">Resolved</b-th>
        </b-tr>
      </b-thead>
      <b-tbody>
        <b-tr v-if="conflict.geometryConflict">
          <b-th class="text-nowrap">
            <app-icon
              :variant="conflict.type === 'node' ? 'location_on' : 'route'"
              size="16"
            />
            {{ conflict.type === 'node' ? 'Location' : 'Geometry' }}
          </b-th>
          <b-td
            class="pick-cell"
            :class="{ 'table-danger': resolution.chosenSide === 'a' }"
            @click="emit('choose-side', 'a')"
          >
            {{ geometryDescription(conflict.a) }}
          </b-td>
          <b-td
            class="pick-cell"
            :class="{ 'table-primary': resolution.chosenSide === 'b' }"
            @click="emit('choose-side', 'b')"
          >
            {{ geometryDescription(conflict.b) }}
          </b-td>
          <b-td>
            <b-badge
              v-if="resolution.chosenSide === 'a' || resolution.chosenSide === 'b'"
              :variant="resolution.chosenSide === 'a' ? 'danger' : 'primary'"
            >
              {{ resolution.chosenSide === 'a' ? 'A' : 'B' }}
            </b-badge>
          </b-td>
        </b-tr>

        <b-tr
          v-for="row in tagRows"
          :key="row.key"
          :class="{ 'table-secondary': !row.conflict }"
        >
          <b-th class="text-nowrap">
            <app-icon
              variant="sell"
              size="16"
            />
            {{ row.key }}
          </b-th>

          <template v-if="!row.conflict">
            <b-td colspan="2">{{ row.merged ?? '(none)' }}</b-td>
            <b-td />
          </template>

          <template v-else>
            <b-td
              class="pick-cell"
              :class="{ 'table-danger': isChosen(row, 'a') }"
              @click="emit('set-tag', row.key, row.aValue ?? '')"
            >
              <span :class="{ 'text-muted fst-italic': row.aValue === undefined }">
                {{ row.aValue ?? '(none)' }}
              </span>
            </b-td>
            <b-td
              class="pick-cell"
              :class="{ 'table-primary': isChosen(row, 'b') }"
              @click="emit('set-tag', row.key, row.bValue ?? '')"
            >
              <span :class="{ 'text-muted fst-italic': row.bValue === undefined }">
                {{ row.bValue ?? '(none)' }}
              </span>
            </b-td>
            <b-td>
              <b-form-input
                :model-value="ownValue(resolution.tags, row.key) ?? ''"
                size="sm"
                placeholder="Custom value"
                :maxlength="MAX_TAG_LENGTH"
                :state="isDecided(row.key) ? null : false"
                @update:model-value="emit('set-tag', row.key, String($event))"
              />
            </b-td>
          </template>
        </b-tr>
      </b-tbody>
    </b-table-simple>
  </div>
</template>

<script setup lang="ts">
import { toRaw } from 'vue';

import { MAX_TAG_LENGTH } from '~/services/merge';

import type { ResolutionState } from '~/composables/useConflictResolutions';
import type { MergeConflict } from '~/services/merge';
import type { OsmElement, OsmTags } from '~/types/osm';

/**
 * Reads a tag value, own properties only and off the raw object.
 *
 * Tag keys are arbitrary data and OSM reserves none. A key named `toString`
 * resolves to the inherited member on a plain object, and Vue's reactive get
 * trap shadows `hasOwnProperty`. Either way the value read is a function,
 * which renders as source, is emitted as the chosen value, and ends up in the
 * uploaded changeset.
 */
function ownValue(tags: OsmTags, key: string): string | undefined {
  const raw = toRaw(tags);

  return Object.hasOwn(raw, key) ? raw[key] : undefined;
}

interface TagRow {
  key: string;
  aValue: string | undefined;
  bValue: string | undefined;
  merged: string | undefined;
  conflict: boolean;
}

interface Props {
  conflict: MergeConflict;
  resolution: ResolutionState;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'choose-side': [side: 'a' | 'b'];
  'set-tag': [key: string, value: string];
}>();

const tagRows = computed<TagRow[]>(() => {
  const aTags = props.conflict.a.tags ?? { };
  const bTags = props.conflict.b.tags ?? { };
  const conflicting = new Set(props.conflict.tagConflicts);

  const keys = new Set([
    ...Object.keys(aTags),
    ...Object.keys(bTags),
    ...Object.keys(toRaw(props.conflict.mergedTags))
  ]);

  return [...keys].sort().map(key => ({
    key,
    aValue: ownValue(aTags, key),
    bValue: ownValue(bTags, key),
    merged: ownValue(props.conflict.mergedTags, key),
    conflict: conflicting.has(key)
  }));
});

function isDecided(key: string): boolean {
  return props.resolution.decidedTags.includes(key);
}

function isChosen(row: TagRow, side: 'a' | 'b'): boolean {
  if (!isDecided(row.key)) {
    return false;
  }

  const sideValue = side === 'a' ? row.aValue : row.bValue;

  return ownValue(props.resolution.tags, row.key) === sideValue;
}

function geometryDescription(element: OsmElement): string {
  if (element.type === 'node') {
    return `${element.lat}, ${element.lon}`;
  }

  if (element.type === 'way') {
    return `${element.nodes.length} nodes`;
  }

  return `${element.members.length} members`;
}
</script>

<style scoped lang="scss">
.pick-cell {
  cursor: pointer;
}

.resolved-column {
  min-width: 110px;
}
</style>
