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
        <div
          v-for="group in visibleGroups"
          :key="groupKey(group)"
          class="level-group"
          :class="{ 'level-group-no-station': !group.station }"
          :role="group.station ? 'group' : undefined"
          :aria-label="group.station?.name"
        >
          <div
            v-if="group.station"
            class="list-group-item level-group-heading"
            :title="`Station ${group.station.stopId}`"
          >
            {{ group.station.name }}
          </div>
          <button
            v-else
            type="button"
            role="radio"
            class="list-group-item list-group-item-action level-view-entry"
            :class="{ active: isViewShown(viewFor(group)) }"
            :aria-checked="isViewShown(viewFor(group))"
            :title="viewTitle(group)"
            @click="toggleView(viewFor(group))"
          >
            No station
          </button>
          <div
            v-for="level in group.levels"
            :key="`${groupKey(group)}:${level.levelId}`"
            class="list-group-item level-row"
            :class="{
              'active': currentLevelId === level.levelId,
              'level-dragging': isDragging(group, level),
              'level-drop-before': isDropTarget(group, level, true),
              'level-drop-after': isDropTarget(group, level, false)
            }"
            :draggable="isMovable(level)"
            @dragstart="onDragStart($event, group, level)"
            @dragover="onDragOver($event, group, level)"
            @drop="onDrop($event, group)"
            @dragend="onDragEnd"
          >
            <button
              v-if="isMovable(level)"
              :ref="(el) => setHandleRef(group, level, el)"
              type="button"
              class="btn btn-sm level-handle"
              :title="`Drag (or use the arrow keys) to move ${levelLabel(level)} up or down`"
              :aria-label="`Move ${levelLabel(level)}; use the up and down arrow keys`"
              @keydown.up.prevent="move(group, level, -1)"
              @keydown.down.prevent="move(group, level, 1)"
            >
              <app-icon
                variant="drag_indicator"
                no-margin
              />
            </button>
            <button
              v-else
              type="button"
              class="btn btn-sm level-handle level-handle-disabled"
              aria-disabled="true"
              :title="`Add an outline to ${levelLabel(level)} before moving it`"
              :aria-label="`Can't move ${levelLabel(level)} until it has an outline`"
            >
              <app-icon
                variant="drag_indicator"
                no-margin
              />
            </button>
            <button
              type="button"
              role="radio"
              class="level-row-main"
              :aria-checked="currentLevelId === level.levelId"
              :title="currentLevelId === level.levelId ? 'Click again to show everything' : undefined"
              @click="toggleView({ kind: 'level', levelId: level.levelId })"
            >
              <span class="level-title">{{ levelLabel(level) }}</span>
              <span
                class="badge text-bg-light"
                :title="`${stopCount(level.levelId)} stops`"
              >{{ stopCount(level.levelId) }}</span>
            </button>
            <button
              type="button"
              class="btn btn-sm level-zoom"
              :title="`Zoom to ${levelLabel(level)}`"
              :aria-label="`Zoom to ${levelLabel(level)}`"
              @click="tools.zoomToLevel(level.levelId)"
            >
              <app-icon
                variant="zoom_in"
                no-margin
              />
            </button>
            <div
              class="level-outline"
              :class="{ 'level-outline-missing': !level.areaIds.length }"
            >
              <template v-if="level.areaIds.length">
                {{ outlineLabel(level) }}
              </template>
              <template v-else>
                No outline,
                <button
                  type="button"
                  class="btn btn-link level-draw"
                  :title="`Draw an outline for ${levelLabel(level)}`"
                  :aria-label="`Draw an outline for ${levelLabel(level)}`"
                  @click="tools.drawLevel(level)"
                >
                  <app-icon
                    variant="edit"
                    no-margin
                  />
                  add one
                </button>
              </template>
            </div>
          </div>
          <button
            v-if="group.station"
            type="button"
            role="radio"
            class="list-group-item list-group-item-action level-view-entry"
            :class="{ active: isViewShown(viewFor(group)) }"
            :aria-checked="isViewShown(viewFor(group))"
            :title="viewTitle(group)"
            @click="toggleView(viewFor(group))"
          >
            No level
          </button>
        </div>
      </div>
      <p
        v-if="levels.filter(isMovable).length > 1"
        class="level-panel-hint"
      >
        Highest level first. Drag levels to reorder them (within a station); level_index follows the order, with the ground level (0) kept at 0.
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
import type { Rapid3LevelTools } from '~/services/rapid3-levels';
import type { Level, LevelView, StationLevelGroup } from '~/services/pathways-levels';

// @test unit: "Add level" starts drawing a new level's outline on the map
// @test unit: each level shows whether it has an outline; levels without one can have one drawn
// @test unit: level areas missing a level_id are flagged, and "Fill level_id" generates one
// @test unit: lists levels highest first, and selecting one shows only that level; selecting it again shows everything
// @test unit: "No station" (at the top, over the levels no station uses) shows only features not tied to a station; it's hidden when there's nothing outside a station
// @test unit: each station ends with "No level", which shows that station's features that have no level
// @test unit: with more than one station, levels are grouped under the stations whose stops use them
// @test unit: levels with an outline can be reordered by dragging or with the arrow keys, which renumbers level_index
// @test unit: levels without an outline show a disabled handle saying to add an outline first
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

// Levels grouped by station, each highest first. The first group (no station)
// sits under the "No station" entry; each station's group ends with "No level".
const levelGroups = computed(() => props.tools.levelGroups.value);

// "No station" is hidden when it has nothing to list or show: no levels under
// it and no stops outside a station.
const visibleGroups = computed(() => levelGroups.value.filter(group => group.station
  || group.levels.length > 0
  || props.tools.noStationStopCount.value > 0));

/** The view a group's entry selects: "No station", or a station's "No level". */
function viewFor(group: StationLevelGroup): LevelView {
  return group.station ? { kind: 'stationNoLevel', stationId: group.station.stopId } : { kind: 'noStation' };
}

function isViewShown(view: LevelView): boolean {
  return JSON.stringify(props.tools.view.value) === JSON.stringify(view);
}

/** Shows a view, or everything if it's already shown. */
function toggleView(view: LevelView) {
  props.tools.showView(isViewShown(view) ? undefined : view);
}

function viewTitle(group: StationLevelGroup): string {
  const title = group.station
    ? `Show ${group.station.name}'s features that have no level, such as its street entrances`
    : 'Show only features not tied to a station';
  return isViewShown(viewFor(group)) ? `${title} (click again to show everything)` : title;
}

function groupKey(group: StationLevelGroup): string {
  return group.station ? `station:${group.station.stopId}` : 'no-station';
}

// Only levels with an outline can move, since level_index is stored on the outline.
function isMovable(level: Level): boolean {
  return level.areaIds.length > 0;
}

function movableIds(group: StationLevelGroup): string[] {
  return group.levels.filter(isMovable).map(level => level.levelId);
}

/** Moves `levelId` to `position` among the group's movable levels and renumbers them. */
function moveTo(group: StationLevelGroup, levelId: string, position: number) {
  const current = movableIds(group);
  const ids = current.filter(id => id !== levelId);
  ids.splice(Math.max(0, Math.min(position, ids.length)), 0, levelId);
  if (ids.join('\n') !== current.join('\n')) {
    props.tools.reorderLevels(ids);
  }
}

const handleRefs = new Map<string, HTMLElement>();
function handleKey(group: StationLevelGroup, level: Level): string {
  return `${groupKey(group)}:${level.levelId}`;
}
function setHandleRef(group: StationLevelGroup, level: Level, el: unknown) {
  if (el instanceof HTMLElement) handleRefs.set(handleKey(group, level), el);
  else handleRefs.delete(handleKey(group, level));
}

/** Keyboard reordering from a row's handle; keeps focus on the moved handle. */
async function move(group: StationLevelGroup, level: Level, delta: number) {
  if (!isMovable(level)) return;
  const ids = movableIds(group);
  const position = ids.indexOf(level.levelId) + delta;
  if (position < 0 || position >= ids.length) return;
  const key = handleKey(group, level);
  moveTo(group, level.levelId, position);
  await nextTick();
  handleRefs.get(key)?.focus();
}

// Dragging stays within one station's group.
const dragging = ref<{ group: string; levelId: string }>();
const dropTarget = ref<{ group: string; levelId: string; before: boolean }>();

function isDragging(group: StationLevelGroup, level: Level): boolean {
  return dragging.value?.group === groupKey(group) && dragging.value.levelId === level.levelId;
}

function isDropTarget(group: StationLevelGroup, level: Level, before: boolean): boolean {
  const target = dropTarget.value;
  return target?.group === groupKey(group) && target.levelId === level.levelId && target.before === before;
}

function onDragStart(event: DragEvent, group: StationLevelGroup, level: Level) {
  if (!isMovable(level)) return;
  dragging.value = { group: groupKey(group), levelId: level.levelId };
  event.dataTransfer?.setData('text/plain', level.levelId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(event: DragEvent, group: StationLevelGroup, level: Level) {
  if (dragging.value?.group !== groupKey(group)) return; // not droppable here
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

  // Levels without an outline can't move, so dropping on one means "at the bottom".
  if (!isMovable(level)) {
    const last = movableIds(group).at(-1);
    dropTarget.value = last ? { group: groupKey(group), levelId: last, before: false } : undefined;
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dropTarget.value = {
    group: groupKey(group),
    levelId: level.levelId,
    before: event.clientY < rect.top + rect.height / 2
  };
}

function onDrop(event: DragEvent, group: StationLevelGroup) {
  event.preventDefault();
  const levelId = dragging.value?.levelId;
  const target = dropTarget.value;
  onDragEnd();
  if (!levelId || target?.group !== groupKey(group)) return;

  const others = movableIds(group).filter(id => id !== levelId);
  const targetPosition = others.indexOf(target.levelId);
  if (targetPosition < 0) return; // dropped on itself
  moveTo(group, levelId, target.before ? targetPosition : targetPosition + 1);
}

function onDragEnd() {
  dragging.value = undefined;
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

// Rows sit inside per-station wrappers, so Bootstrap's sibling-based list-group
// borders and corner rounding need restating across the wrappers.
.level-group > .list-group-item {
  border-radius: 0;
}

.level-group + .level-group > .list-group-item:first-child,
.level-group > .list-group-item + .list-group-item {
  border-top-width: 0;
}

.level-group:first-child > .list-group-item:first-child {
  border-top-left-radius: var(--bs-list-group-border-radius);
  border-top-right-radius: var(--bs-list-group-border-radius);
}

.level-group:last-child > .list-group-item:last-child {
  border-bottom-right-radius: var(--bs-list-group-border-radius);
  border-bottom-left-radius: var(--bs-list-group-border-radius);
}

.level-group-no-station .level-row {
  padding-left: 1rem; // levels listed under "No station"
}

.level-group-heading {
  padding: 0.5rem 0.5rem 0.25rem;
  background: var(--bs-secondary-bg);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--bs-secondary-color);
}

.level-row {
  display: grid;
  grid-template-areas:
    "handle main zoom"
    "handle outline zoom";
  grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 0.25rem;
  padding: 0.375rem 0.25rem;
}

.level-row:not(.active):hover {
  background: var(--bs-tertiary-bg);
}

.level-handle {
  grid-area: handle;
  align-self: stretch;
  padding: 0;
  border: 0;
  color: inherit;
  opacity: 0.6;
  cursor: grab;
}

.level-handle-disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.level-row[draggable="true"]:active .level-handle {
  cursor: grabbing;
}

.level-row-main {
  grid-area: main;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
}

.level-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-zoom {
  grid-area: zoom;
  border: 0;
  color: inherit;
}

.level-outline {
  grid-area: outline;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  opacity: 0.75;
}

.level-outline-missing {
  font-style: italic;
}

.level-draw {
  padding: 0;
  border: 0;
  font-size: inherit;
  font-style: normal;
  vertical-align: baseline;
}

.level-row.active .level-draw {
  color: inherit;
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
