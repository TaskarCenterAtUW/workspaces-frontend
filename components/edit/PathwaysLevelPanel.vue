<template>
  <aside
    class="level-panel"
    aria-label="Levels"
  >
    <section class="level-panel-section">
      <div class="level-panel-header">
        <h2 class="level-panel-heading">
          Levels
        </h2>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          title="Add a level by drawing its outline: click the map to place each corner, then click the first corner (or press Enter) to finish"
          @click="tools.drawLevel()"
        >
          Add level
        </button>
      </div>
      <p
        v-if="!levels.length"
        class="level-panel-hint"
      >
        No levels yet. Use <strong>Add level</strong> to outline one on the map.
      </p>
      <div
        class="list-group level-list"
        role="radiogroup"
        aria-label="Show level"
      >
        <button
          type="button"
          role="radio"
          class="list-group-item list-group-item-action"
          :class="{ active: !currentLevelId }"
          :aria-checked="!currentLevelId"
          @click="tools.showLevel(undefined)"
        >
          All levels
        </button>
        <div
          v-for="level in displayLevels"
          :key="level.levelId"
          class="level-row"
          :class="{
            'level-dragging': draggingId === level.levelId,
            'level-drop-before': dropTarget?.levelId === level.levelId && dropTarget.before,
            'level-drop-after': dropTarget?.levelId === level.levelId && !dropTarget.before
          }"
          :draggable="isMovable(level)"
          @dragstart="onDragStart($event, level)"
          @dragover="onDragOver($event, level)"
          @drop="onDrop($event)"
          @dragend="onDragEnd"
        >
          <button
            v-if="isMovable(level)"
            :ref="(el) => setHandleRef(level.levelId, el)"
            type="button"
            class="btn btn-sm level-handle"
            :title="`Drag (or use the arrow keys) to move ${levelLabel(level)} up or down`"
            :aria-label="`Move ${levelLabel(level)}; use the up and down arrow keys`"
            @keydown.up.prevent="move(level, -1)"
            @keydown.down.prevent="move(level, 1)"
          >
            <app-icon
              variant="drag_indicator"
              no-margin
            />
          </button>
          <span
            v-else
            class="level-handle-spacer"
          />
          <button
            type="button"
            role="radio"
            class="list-group-item list-group-item-action level-row-main"
            :class="{ active: currentLevelId === level.levelId }"
            :aria-checked="currentLevelId === level.levelId"
            @click="tools.showLevel(level.levelId)"
          >
            <span class="level-name">
              <span class="level-title">{{ levelLabel(level) }}</span>
              <span
                class="level-outline"
                :class="{ 'level-outline-missing': !level.areaIds.length }"
              >{{ outlineLabel(level) }}</span>
            </span>
            <span
              class="badge text-bg-light"
              :title="`${stopCount(level.levelId)} stops`"
            >{{ stopCount(level.levelId) }}</span>
          </button>
          <button
            v-if="!level.areaIds.length"
            type="button"
            class="btn btn-sm btn-outline-primary level-draw"
            :title="`Draw an outline for ${levelLabel(level)}`"
            :aria-label="`Draw an outline for ${levelLabel(level)}`"
            @click="tools.drawLevel(level)"
          >
            <app-icon
              variant="edit"
              no-margin
            />
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary level-zoom"
            :title="`Zoom to ${levelLabel(level)}`"
            :aria-label="`Zoom to ${levelLabel(level)}`"
            @click="tools.zoomToLevel(level.levelId)"
          >
            <app-icon
              variant="zoom_in"
              no-margin
            />
          </button>
        </div>
      </div>
      <p
        v-if="levels.filter(isMovable).length > 1"
        class="level-panel-hint"
      >
        Highest level first. Drag levels to reorder them; level_index follows the order, with the ground level (0) kept at 0.
      </p>
      <p
        v-if="levels.some(level => !level.areaIds.length)"
        class="level-panel-hint"
      >
        Levels with no outline are only used by stops so far; draw one to give them an area.
      </p>
    </section>

    <section
      v-if="unleveled.length || levelAreasMissingId.length"
      class="level-panel-section"
    >
      <h2 class="level-panel-heading text-warning-emphasis">
        Missing level ({{ unleveled.length }})
      </h2>
      <button
        v-if="currentLevelId && unleveled.length > 1"
        type="button"
        class="btn btn-sm btn-outline-primary mb-2"
        @click="tools.assignLevel(unleveled.map(stop => stop.id), currentLevelId)"
      >
        Set all to {{ currentLevelLabel }}
      </button>
      <ul class="list-group level-issues">
        <li
          v-for="stop in unleveled"
          :key="stop.id"
          class="list-group-item level-issue"
        >
          <button
            type="button"
            class="btn btn-link btn-sm level-issue-link"
            @click="tools.select(stop.id)"
          >
            {{ stop.label }}
          </button>
          <button
            v-if="currentLevelId"
            type="button"
            class="btn btn-sm btn-outline-primary"
            :title="`Set level to ${currentLevelLabel}`"
            @click="tools.assignLevel([stop.id], currentLevelId)"
          >
            Set level
          </button>
        </li>
        <li
          v-for="area in levelAreasMissingId"
          :key="area.id"
          class="list-group-item level-issue"
        >
          <button
            type="button"
            class="btn btn-link btn-sm level-issue-link"
            @click="tools.select(area.id)"
          >
            Level area {{ area.label }} has no level_id
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            title="Give this level area a generated level_id"
            @click="tools.fillLevelId(area.id)"
          >
            Fill level_id
          </button>
        </li>
      </ul>
      <p
        v-if="!currentLevelId && unleveled.length"
        class="level-panel-hint"
      >
        Pick a level above to assign stops to it.
      </p>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { levelsTopDown } from '~/services/pathways-levels';
import type { Rapid3LevelTools } from '~/services/rapid3-levels';
import type { Level } from '~/services/pathways-levels';

// @test unit: "Add level" starts drawing a new level's outline on the map
// @test unit: each level shows whether it has an outline; levels without one can have one drawn
// @test unit: level areas missing a level_id are flagged, and "Fill level_id" generates one
// @test unit: lists levels highest first, with an "All levels" option, and selecting one shows only that level
// @test unit: levels with an outline can be reordered by dragging or with the arrow keys, which renumbers level_index
// @test unit: lists stops with no level, and "Set level" assigns the selected level to them

const props = defineProps<{
  tools: Rapid3LevelTools;
}>();

const levels = computed(() => props.tools.levels.value);
const stopGroups = computed(() => props.tools.stopGroups.value);
const unleveled = computed(() => props.tools.unleveled.value);
const levelAreasMissingId = computed(() => props.tools.levelAreasMissingId.value);
const currentLevelId = computed(() => props.tools.currentLevelId.value);
const currentLevelLabel = computed(() => {
  const level = levels.value.find(l => l.levelId === currentLevelId.value);
  return level ? levelLabel(level) : currentLevelId.value;
});

// Levels in panel order (highest first); only those with an outline can move,
// since level_index is stored on the outline.
const displayLevels = computed(() => levelsTopDown(levels.value));
const movableIds = computed(() => displayLevels.value.filter(isMovable).map(level => level.levelId));

function isMovable(level: Level): boolean {
  return level.areaIds.length > 0;
}

/** Moves `levelId` to `position` among the movable levels and renumbers them. */
function moveTo(levelId: string, position: number) {
  const ids = movableIds.value.filter(id => id !== levelId);
  ids.splice(Math.max(0, Math.min(position, ids.length)), 0, levelId);
  if (ids.join('\n') !== movableIds.value.join('\n')) {
    props.tools.reorderLevels(ids);
  }
}

const handleRefs = new Map<string, HTMLElement>();
function setHandleRef(levelId: string, el: unknown) {
  if (el instanceof HTMLElement) handleRefs.set(levelId, el);
  else handleRefs.delete(levelId);
}

/** Keyboard reordering from a row's handle; keeps focus on the moved handle. */
async function move(level: Level, delta: number) {
  const position = movableIds.value.indexOf(level.levelId) + delta;
  if (position < 0 || position >= movableIds.value.length) return;
  moveTo(level.levelId, position);
  await nextTick();
  handleRefs.get(level.levelId)?.focus();
}

const draggingId = ref<string>();
const dropTarget = ref<{ levelId: string; before: boolean }>();

function onDragStart(event: DragEvent, level: Level) {
  if (!isMovable(level)) return;
  draggingId.value = level.levelId;
  event.dataTransfer?.setData('text/plain', level.levelId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(event: DragEvent, level: Level) {
  if (!draggingId.value) return;
  event.preventDefault(); // allow dropping here
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

  // Levels without an outline can't move, so dropping on one means "at the bottom".
  if (!isMovable(level)) {
    const last = movableIds.value.at(-1);
    dropTarget.value = last ? { levelId: last, before: false } : undefined;
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dropTarget.value = { levelId: level.levelId, before: event.clientY < rect.top + rect.height / 2 };
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  const levelId = draggingId.value;
  const target = dropTarget.value;
  onDragEnd();
  if (!levelId || !target) return;

  const others = movableIds.value.filter(id => id !== levelId);
  const targetPosition = others.indexOf(target.levelId);
  if (targetPosition < 0) return; // dropped on itself
  moveTo(levelId, target.before ? targetPosition : targetPosition + 1);
}

function onDragEnd() {
  draggingId.value = undefined;
  dropTarget.value = undefined;
}

function outlineLabel(level: Level): string {
  const count = level.areaIds.length;
  if (!count) return 'No outline';
  return count === 1 ? 'Outline drawn' : `${count} outlines`;
}

function levelLabel(level: Level): string {
  return level.name ? `${level.name} (${level.levelId})` : level.levelId;
}

function stopCount(levelId: string): number {
  return stopGroups.value.find(group => group.level?.levelId === levelId)?.stops.length ?? 0;
}
</script>

<style lang="scss" scoped>
.level-panel {
  flex: 0 0 18rem;
  height: 100%;
  overflow-y: auto;
  padding: 0.75rem;
  border-left: 1px solid var(--bs-border-color);
  background: var(--bs-body-bg);
  font-size: 0.875rem;
}

.level-panel-section + .level-panel-section {
  margin-top: 1.25rem;
}

.level-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.level-panel-heading {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.level-panel-header .level-panel-heading {
  margin-bottom: 0;
}

.level-panel-hint {
  margin: 0.5rem 0 0;
  color: var(--bs-secondary-color);
  font-size: 0.8rem;
}

.level-row {
  display: flex;
  align-items: stretch;
}

.level-row-main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.level-name {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.level-title,
.level-outline {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-outline {
  font-size: 0.75rem;
  opacity: 0.75;
}

.level-outline-missing {
  font-style: italic;
}

.level-zoom,
.level-draw {
  border-radius: 0;
}

.level-handle,
.level-handle-spacer {
  flex: 0 0 1.75rem;
  padding: 0;
}

.level-handle {
  border: 0;
  color: var(--bs-secondary-color);
  cursor: grab;
}

.level-row[draggable="true"]:active .level-handle {
  cursor: grabbing;
}

.level-dragging {
  opacity: 0.5;
}

.level-drop-before {
  box-shadow: inset 0 2px 0 var(--bs-primary);
}

.level-drop-after {
  box-shadow: inset 0 -2px 0 var(--bs-primary);
}

.level-issues {
  max-height: 14rem;
  overflow-y: auto;
}

.level-issue {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
}

.level-issue-link {
  padding: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
