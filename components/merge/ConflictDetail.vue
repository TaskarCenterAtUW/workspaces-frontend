<template>
  <section class="conflicts-main">
    <div
      v-if="conflict && resolution"
      class="d-flex flex-column h-100"
    >
      <div class="conflict-map-container">
        <merge-conflict-map
          v-if="lookup"
          ref="conflictMapRef"
          :conflict="conflict"
          :lookup="lookup"
          :fallback="ancestor"
        />
      </div>

      <b-card
        class="conflict-detail"
        no-body
      >
        <div class="detail-toolbar d-flex align-items-center gap-2 p-2 border-bottom bg-light">
          <span class="fw-bold small">
            {{ conflict.type }} {{ conflict.elementId }}
          </span>
          <span
            v-if="conflict.kind !== 'both-modified'"
            class="small text-body-secondary"
          >
            {{ deletionNotice(conflict) }}
          </span>
          <div class="ms-auto d-flex gap-2">
            <b-button
              v-if="conflict.kind !== 'deleted-in-a'"
              variant="outline-danger"
              size="sm"
              @click="emit('keep-side', 'a')"
            >
              Keep A
            </b-button>
            <b-button
              v-if="conflict.kind !== 'deleted-in-b'"
              variant="outline-primary"
              size="sm"
              @click="emit('keep-side', 'b')"
            >
              Keep B
            </b-button>
            <b-button
              v-if="conflict.kind !== 'both-modified'"
              variant="outline-dark"
              size="sm"
              @click="emit('drop-element')"
            >
              Delete Element
            </b-button>
            <b-button
              variant="outline-secondary"
              size="sm"
              title="Opens workspace A in the editor for reference. The merge is not saved, so leaving discards your resolutions."
              :disabled="committing"
              @click="emit('inspect')"
            >
              <app-icon
                variant="edit_location_alt"
                size="16"
              />
              Inspect in Editor
            </b-button>
          </div>
        </div>

        <div
          v-if="resolution.chosenSide === 'delete'"
          class="p-3 text-body-secondary"
        >
          This element will be left out of the merged workspace.
        </div>
        <merge-conflict-tag-table
          v-else
          :conflict="conflict"
          :resolution="resolution"
          @choose-side="emit('choose-side', $event)"
          @set-tag="(key, value) => emit('set-tag', key, value)"
        />
      </b-card>
    </div>

    <div
      v-else
      class="d-flex align-items-center justify-content-center h-100 text-muted"
    >
      <div class="text-center">
        <app-icon
          variant="touch_app"
          size="48"
          class="d-block mb-2 opacity-50"
        />
        Select a conflict from the list to begin resolving.
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type ConflictMap from '~/components/merge/ConflictMap.vue';
import type { ResolutionState } from '~/composables/useConflictResolutions';
import type { MergeConflict } from '~/services/merge';
import type { OsmElementLookup } from '~/util/osm';

interface Props {
  conflict?: MergeConflict;
  resolution?: ResolutionState;

  /** The merged elements. The map is not shown without them. */
  lookup?: OsmElementLookup;

  /** The common ancestor, which the map falls back to. */
  ancestor?: OsmElementLookup;
  committing: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  'keep-side': [side: 'a' | 'b'];
  'drop-element': [];
  'choose-side': [side: 'a' | 'b'];
  'set-tag': [key: string, value: string];
  'inspect': [];
}>();

const conflictMapRef = useTemplateRef<InstanceType<typeof ConflictMap>>('conflictMapRef');

/** The map's current view, or undefined when the map is not shown. */
function getLatLonZoom() {
  return conflictMapRef.value?.getLatLonZoom();
}

defineExpose({ getLatLonZoom });

function deletionNotice(conflict: MergeConflict): string {
  return conflict.kind === 'deleted-in-a'
    ? 'Deleted in this workspace, edited in the other.'
    : 'Edited in this workspace, deleted in the other.';
}
</script>

<style scoped lang="scss">
@import "assets/scss/theme.scss";

.conflicts-main {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .conflict-map-container {
    flex: 1 1 0;
    min-height: 0;
    background-color: $gray-200;
  }

  .conflict-detail {
    flex-shrink: 0;
    max-height: 40%;
    overflow-y: auto;
    border-top: 1px solid $border-color;

    .detail-toolbar {
      position: sticky;
      top: 0;
      z-index: 1;
    }
  }
}
</style>
