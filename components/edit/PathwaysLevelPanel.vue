<template>
  <aside
    class="level-panel"
    aria-label="Stations"
  >
    <section class="level-panel-section">
      <div class="level-panel-header">
        <h2 class="level-panel-heading">
          Stations In View
        </h2>
        <button
          v-if="unoutlinedIds.length"
          type="button"
          class="btn btn-sm btn-outline-primary"
          :title="`Draw a box around the stops of each level that has no outline yet (${unoutlinedIds.length}); each goes above its station's other levels, then drag to put it in order`"
          @click="tools.outlineLevels(unoutlinedIds)"
        >
          Outline all ({{ unoutlinedIds.length }})
        </button>
      </div>
      <p
        v-if="tools.workspaceLoad.value === 'loading'"
        class="level-panel-hint"
        role="status"
      >
        Loading the whole workspace&hellip; until it's loaded, stations outside the areas you've viewed are missing, so their levels may show under "No station".
      </p>
      <p
        v-else-if="tools.workspaceLoad.value === 'failed'"
        class="level-panel-hint level-panel-load-failed"
        role="alert"
      >
        Couldn't load the whole workspace, so stations outside the areas you've viewed are missing and their levels may show under "No station".
        <button
          v-if="tools.retryWorkspaceLoad"
          type="button"
          class="btn btn-link btn-sm level-load-retry"
          @click="tools.retryWorkspaceLoad()"
        >
          Retry
        </button>
      </p>
      <p
        v-if="!levels.length"
        class="level-panel-hint"
      >
        No levels yet. Levels appear here once stops have a level_id.
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
          >
            <button
              type="button"
              class="btn btn-link level-station-link"
              :title="`Select ${group.station.name} (stop_id ${group.station.stopId}) to see or edit it`"
              @click="tools.select(String(group.station.id))"
              @mouseenter="hover([String(group.station.id)])"
              @mouseleave="hover([])"
              @focus="hover([String(group.station.id)])"
              @blur="hover([])"
            >
              {{ group.station.name }}
            </button>
            <button
              type="button"
              class="btn btn-sm level-zoom"
              :title="`Zoom to ${group.station.name}`"
              :aria-label="`Zoom to ${group.station.name}`"
              @click="tools.zoomToStation(group.station.stopId)"
            >
              <app-icon
                variant="zoom_in"
                no-margin
              />
            </button>
          </div>
          <div
            v-if="group.station"
            class="list-group-item level-view-row"
            :class="{ active: isViewShown(viewFor(group)) }"
          >
            <button
              type="button"
              class="btn btn-sm level-expand"
              :aria-expanded="isExpanded(group, undefined)"
              :aria-label="`${isExpanded(group, undefined) ? 'Hide' : 'Show'} ${group.station.name}'s stops with no level`"
              :title="`${isExpanded(group, undefined) ? 'Hide' : 'Show'} ${group.station.name}'s stops with no level`"
              :disabled="!stopsIn(group, undefined).length && !edgesIn(group, undefined).length"
              @click="toggleExpanded(group, undefined)"
            >
              <app-icon
                :variant="isExpanded(group, undefined) ? 'expand_more' : 'chevron_right'"
                no-margin
              />
            </button>
            <button
              type="button"
              role="radio"
              class="level-view-entry level-view-main"
              :aria-checked="isViewShown(viewFor(group))"
              :title="viewTitle(group)"
              @click="toggleView(viewFor(group))"
            >
              No level
            </button>
            <button
              type="button"
              class="btn btn-sm level-zoom"
              :title="`Zoom to ${group.station.name}'s features with no level`"
              :aria-label="`Zoom to ${group.station.name}'s features with no level`"
              @click="tools.zoomToStation(group.station.stopId, { noLevel: true })"
            >
              <app-icon
                variant="zoom_in"
                no-margin
              />
            </button>
          </div>
          <edit-pathways-level-contents
            v-if="group.station && isExpanded(group, undefined)"
            :nodes="stopsIn(group, undefined)"
            :edges="edgesIn(group, undefined)"
            :label="`Contents of ${group.station.name} with no level`"
            :scope="`with no level in ${group.station.name}`"
            @select="(id) => tools.select(id)"
            @hover="(id) => hover(id ? [id] : [])"
          />
          <button
            v-if="!group.station"
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
          <template
            v-for="level in levelsHighestFirst(group.levels)"
            :key="`${groupKey(group)}:${level.levelId}`"
          >
            <div
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
                class="btn btn-sm level-expand"
                :aria-expanded="isExpanded(group, level.levelId)"
                :aria-label="`${isExpanded(group, level.levelId) ? 'Hide' : 'Show'} the stops on ${levelLabel(level)}`"
                :title="`${isExpanded(group, level.levelId) ? 'Hide' : 'Show'} the stops on ${levelLabel(level)}`"
                :disabled="!stopsIn(group, level.levelId).length && !edgesIn(group, level.levelId).length"
                @click="toggleExpanded(group, level.levelId)"
              >
                <app-icon
                  :variant="isExpanded(group, level.levelId) ? 'expand_more' : 'chevron_right'"
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
                @mouseenter="hover(level.areaIds.map(String))"
                @mouseleave="hover([])"
                @focus="hover(level.areaIds.map(String))"
                @blur="hover([])"
              >
                <span class="level-heading">
                  <span
                    class="level-index"
                    :title="level.index === undefined ? 'No level_index' : `level_index ${level.index}`"
                  >{{ level.index ?? '–' }}</span>
                  <span class="level-title">{{ levelLabel(level) }}</span>
                </span>
                <span class="level-counts">
                  <span
                    class="badge text-bg-light"
                    :title="`${stopsIn(group, level.levelId).length} nodes on this level`"
                  >{{ stopsIn(group, level.levelId).length }} node{{ stopsIn(group, level.levelId).length !== 1 ? 's' : '' }}</span>
                  <span
                    class="badge text-bg-light"
                    :title="`${edgesIn(group, level.levelId).length} pathways (edges) touching this level`"
                  >{{ edgesIn(group, level.levelId).length }} edge{{ edgesIn(group, level.levelId).length !== 1 ? 's' : '' }}</span>
                </span>
              </button>
              <button
                type="button"
                class="btn btn-sm level-refit"
                :class="{ 'level-refit-needed': oversizedAreaIds(level.levelId).length > 0 }"
                :disabled="!!refitBlocker(level)"
                :title="refitBlocker(level) ?? (oversizedAreaIds(level.levelId).length
                  ? `${levelLabel(level)}'s outline is much bigger than its stops need: reshape it into a box around them`
                  : `Reshape ${levelLabel(level)}'s outline into a box around its stops`)"
                :aria-label="`Refit ${levelLabel(level)}'s outline to its stops`"
                @click="tools.refitLevelArea(String(level.areaIds[0]))"
              >
                <app-icon
                  variant="fit_screen"
                  no-margin
                />
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
            </div>
            <edit-pathways-level-contents
              v-if="isExpanded(group, level.levelId)"
              :nodes="stopsIn(group, level.levelId)"
              :edges="edgesIn(group, level.levelId)"
              :label="`Contents of ${levelLabel(level)}`"
              :scope="`on ${levelLabel(level)}`"
              @select="(id) => tools.select(id)"
              @hover="(id) => hover(id ? [id] : [])"
            />
          </template>
        </div>
      </div>
      <p
        v-if="hiddenStationCount > 0"
        class="level-panel-hint"
      >
        {{ hiddenStationCount === 1 ? '1 station is' : `${hiddenStationCount} stations are` }} out of view; pan or zoom the map to list {{ hiddenStationCount === 1 ? 'it' : 'them' }}.
      </p>
    </section>
    <section
      v-if="fixmes.length || referenceDrawing"
      class="level-panel-section fixme-section"
    >
      <div class="level-panel-header">
        <h2 class="level-panel-heading">
          Things to review<template v-if="fixmes.length"> ({{ fixmes.length }})</template>
        </h2>
        <button
          v-if="fixmes.length"
          type="button"
          class="btn btn-sm btn-outline-secondary"
          :aria-expanded="fixmesExpanded"
          @click="fixmesExpanded = !fixmesExpanded"
        >
          {{ fixmesExpanded ? 'Hide' : 'Show' }}
        </button>
      </div>
      <div
        v-if="referenceDrawing"
        class="reference-drawing"
      >
        <div class="form-check">
          <input
            id="show-reference-drawing"
            class="form-check-input"
            type="checkbox"
            :checked="tools.showReferenceDrawings.value"
            @change="tools.toggleReferenceDrawings()"
          >
          <label
            class="form-check-label"
            for="show-reference-drawing"
          >Show this level's reference drawing</label>
        </div>
        <p
          v-if="referenceDrawing.status === 'loading' || referenceDrawing.status === 'failed'"
          class="level-panel-hint reference-drawing-hint"
          :class="{ 'level-panel-load-failed': referenceDrawing.status === 'failed' }"
          :role="referenceDrawing.status === 'failed' ? 'alert' : 'status'"
        >
          {{ REFERENCE_DRAWING_NOTES[referenceDrawing.status] }}
          <button
            v-if="referenceDrawing.status === 'failed'"
            type="button"
            class="btn btn-link btn-sm reference-drawing-retry"
            @click="tools.updateReferenceDrawing()"
          >
            Retry
          </button>
        </p>
        <ul
          v-if="referenceDrawing.status === 'shown' && referenceDrawing.legend?.length"
          class="reference-legend"
          aria-label="Reference drawing colors"
        >
          <li
            v-for="entry in referenceDrawing.legend"
            :key="entry.label"
          >
            <span
              class="reference-legend-swatch"
              :style="{ backgroundColor: entry.color }"
            />
            {{ entry.label }}
          </li>
        </ul>
      </div>
      <ul
        v-if="fixmesExpanded"
        class="fixme-list"
        aria-label="Features with a fixme note"
      >
        <li
          v-for="item in fixmes"
          :key="item.id"
        >
          <button
            type="button"
            class="fixme-item"
            :title="`Select ${item.label}`"
            @click="tools.select(item.id)"
            @mouseenter="tools.highlight([item.id], true)"
            @mouseleave="tools.highlight([item.id], false)"
            @focus="tools.highlight([item.id], true)"
            @blur="tools.highlight([item.id], false)"
          >
            <span class="fixme-label">{{ item.label }}</span>
            <span class="fixme-note">{{ item.note }}</span>
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { levelsHighestFirst } from '~/services/pathways-levels';

import type { LevelPathway, LevelStop, Rapid3LevelTools, ReferenceDrawingStatus } from '~/services/rapid3-levels';
import type { Level, LevelView, StationLevelGroup } from '~/services/pathways-levels';

// @test unit: every level row has "Refit", which reshapes its outline into a box around its stops; disabled (saying why) without one outline and some stops
// @test unit: each level shows its name, node count and edge (pathway) count; "Outline all" by the heading boxes every level that has no outline (level problems are Rapid issues, see services/rapid3-validation.ts)
// @test unit: an outline much bigger than its stops need has its level's "Refit" highlighted
// @test unit: each level (and "No level") expands to list its nodes and edges in that station, under their own categories; clicking one selects it
// @test unit: lists levels highest first (positive level_index, 0, then negative), each showing its level_index, and selecting one shows only that level and selects its outline; selecting it again shows everything
// @test unit: "No station" (at the top, over the levels no station uses) shows only features not tied to a station; it's hidden when there's nothing outside a station
// @test unit: only stations with features in the map view are listed, even the one being viewed
// @test unit: clicking a station's name selects the station in the editor
// @test unit: pointing at a station's name, a level or a listed node or edge highlights it on the map
// @test unit: each station starts with "No level", which shows that station's features that have no level
// @test unit: the station heading and "No level" each have a zoom button (the whole station, or its features with no level)
// @test unit: with more than one station, levels are grouped under the stations whose stops use them
// @test unit: levels with an outline can be reordered by dragging or with the arrow keys, which renumbers level_index
// @test unit: levels without an outline show a disabled handle saying to add an outline first
// @test unit: while the whole workspace is loading, a note says levels may show under "No station"; if it fails, a note offers "Retry"
// @test unit: a "Things to review (N)" section lists every feature with a fixme note (its label and the note), and is hidden when there are none (and no reference drawing); "Hide"/"Show" collapses the list
// @test unit: clicking a fixme entry selects its feature, and pointing at or focusing one highlights it on the map
// @test unit: while a level with a reference drawing is shown, "Things to review" has a checkbox to show or hide it, notes while it's loading or if it couldn't load (with "Retry"), and shows a legend of the roles it draws, each with its color; the section appears for a drawing even with no fixme notes

const props = defineProps<{
  tools: Rapid3LevelTools;
}>();

const levels = computed(() => props.tools.levels.value);
const stopGroups = computed(() => props.tools.stopGroups.value);
const largeLevelAreas = computed(() => props.tools.largeLevelAreas.value);
const currentLevelId = computed(() => props.tools.currentLevelId.value);
// The reference drawing (from pathways-converter) of the level being shown, if it has one.
const referenceDrawing = computed(() => props.tools.referenceDrawing.value);
const REFERENCE_DRAWING_NOTES: Partial<Record<ReferenceDrawingStatus, string>> = {
  loading: 'Loading the reference drawing\u2026',
  failed: 'Couldn\'t load the reference drawing.'
};
// Features with a fixme note, for the review list below the stations.
const fixmes = computed(() => props.tools.fixmes.value);
const fixmesExpanded = ref(true);
// Levels stops use that have no outline yet ("Outline all" boxes them).
const unoutlinedIds = computed(() => levels.value.filter(level => !level.areaIds.length).map(level => level.levelId));

// Levels grouped by station, each lowest first (the rows list them highest first). The first group (no station)
// sits under the "No station" entry; each station's group starts with "No level".
const levelGroups = computed(() => props.tools.levelGroups.value);

// "No station" is hidden when it has nothing to list or show: no levels under
// it and no stops outside a station. Stations are listed only while some of
// their features are in the map view, even the one being viewed.
const visibleGroups = computed(() => levelGroups.value.filter(group => (group.station
  ? isStationListed(group)
  : group.levels.length > 0 || props.tools.noStationStopCount.value > 0)));
const hiddenStationCount = computed(() => levelGroups.value.filter(group => group.station).length
  - visibleGroups.value.filter(group => group.station).length);

function isStationListed(group: StationLevelGroup): boolean {
  const inView = props.tools.visibleStationIds.value;
  return !inView || inView.has(group.station!.stopId);
}

/** The view a group's entry selects: "No station", or a station's "No level". */
function viewFor(group: StationLevelGroup): LevelView {
  return group.station ? { kind: 'stationNoLevel', stationId: group.station.stopId } : { kind: 'noStation' };
}

function isViewShown(view: LevelView): boolean {
  return JSON.stringify(props.tools.view.value) === JSON.stringify(view);
}

/**
 * Shows a view, or everything if it's already shown. Showing a level also
 * selects its outline (opening it in the sidebar); hiding it deselects it.
 */
function toggleView(view: LevelView) {
  const turningOff = isViewShown(view);
  props.tools.showView(turningOff ? undefined : view);
  if (view.kind === 'level') {
    props.tools.selectLevelOutline(turningOff ? undefined : view.levelId);
  }
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
  return levelsHighestFirst(group.levels).filter(isMovable).map(level => level.levelId);
}

/** Moves `levelId` to `position` among the group's movable levels and renumbers them. */
function moveTo(group: StationLevelGroup, levelId: string, position: number) {
  const current = movableIds(group);
  const ids = current.filter(id => id !== levelId);
  ids.splice(Math.max(0, Math.min(position, ids.length)), 0, levelId);
  if (ids.join('\n') !== current.join('\n')) {
    // The panel lists levels top down; reorderLevels takes them lowest first.
    props.tools.reorderLevels([...ids].reverse());
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

/** The level's outlines that are much bigger than its stops need. */
function oversizedAreaIds(levelId: string): string[] {
  return largeLevelAreas.value.filter(area => area.oversized && area.levelId === levelId).map(area => String(area.id));
}

/** Why a level's outline can't be refit to its stops, if it can't. */
function refitBlocker(level: Level): string | undefined {
  if (!level.areaIds.length) return `${levelLabel(level)} has no outline to refit yet`;
  if (level.areaIds.length > 1) return `${levelLabel(level)} has ${level.areaIds.length} outlines; refitting would stack them into one box`;
  if (!stopCount(level.levelId)) return `${levelLabel(level)} has no stops to fit its outline to`;
  return undefined;
}

/**
 * The stops on a level (or, for undefined, with no level) in a group: that
 * station's, or for "No station", those in no station.
 */
function stopsIn(group: StationLevelGroup, levelId: string | undefined): LevelStop[] {
  const stops = stopGroups.value.find(stopGroup => stopGroup.level?.levelId === levelId)?.stops ?? [];
  const stationId = group.station?.stopId;
  return stops.filter(stop => (stationId ? Boolean(stop.stationIds?.includes(stationId)) : !stop.stationIds?.length));
}

/**
 * The pathways (edges) touching a level (or, for undefined, a stop with no
 * level) in a group: those with an end in that station, or for "No station",
 * with no end in any station.
 */
function edgesIn(group: StationLevelGroup, levelId: string | undefined): LevelPathway[] {
  const pathways = props.tools.levelPathways.value.get(levelId ?? '') ?? [];
  const stationId = group.station?.stopId;
  return pathways.filter(pathway => (stationId ? pathway.stationIds.includes(stationId) : !pathway.stationIds.length));
}

// Features highlighted on the map while their row is pointed at or focused.
// Cleared before highlighting others, and when the panel goes away (a row
// removed while hovered never gets its mouseleave).
let highlighted: string[] = [];
function hover(ids: string[]) {
  props.tools.highlight(highlighted, false);
  highlighted = ids;
  props.tools.highlight(highlighted, true);
}
onBeforeUnmount(() => hover([]));

// Levels (and "No level" rows) whose stops are listed, by group and level.
const expanded = ref(new Set<string>());
const expandKey = (group: StationLevelGroup, levelId: string | undefined) => `${groupKey(group)}|${levelId ?? ''}`;

function isExpanded(group: StationLevelGroup, levelId: string | undefined): boolean {
  return expanded.value.has(expandKey(group, levelId));
}

function toggleExpanded(group: StationLevelGroup, levelId: string | undefined) {
  hover([]); // a hovered item may be about to disappear
  const next = new Set(expanded.value);
  const key = expandKey(group, levelId);
  if (!next.delete(key)) next.add(key);
  expanded.value = next;
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
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.fixme-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
}

// Alternate rows are shaded, so long lists are easier to follow.
.fixme-list > li:nth-child(even) {
  background: var(--bs-tertiary-bg);
}

.fixme-item {
  display: block;
  width: 100%;
  padding: 0.25rem 0.375rem;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
}

.fixme-item:hover .fixme-label {
  color: var(--bs-link-hover-color);
  text-decoration: underline;
}

.fixme-label {
  display: block;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fixme-note {
  display: block;
  color: var(--bs-secondary-color);
}

.reference-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.125rem 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.75rem;
  color: var(--bs-secondary-color);
}

.reference-legend-swatch {
  display: inline-block;
  width: 0.9rem;
  height: 0.25rem;
  margin-right: 0.25rem;
  vertical-align: middle;
  border-radius: 1px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
}

.reference-drawing {
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
}

.reference-legend {
  margin-top: 0.25rem;
}

.reference-drawing-retry {
  padding: 0 0.25rem;
  vertical-align: baseline;
}

.level-panel-header .level-panel-heading {
  margin-bottom: 0;
}

.level-panel-heading {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.level-panel-load-failed {
  color: var(--bs-danger-text-emphasis);
}

.level-load-retry {
  padding: 0;
  font-size: inherit;
  vertical-align: baseline;
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

.level-station-link {
  padding: 0;
  border: 0;
  font: inherit;
  letter-spacing: inherit;
  text-align: left;
  text-transform: inherit;
}

.level-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
  padding: 0.5rem 0.25rem 0.25rem 0.5rem;
  background: var(--bs-secondary-bg);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--bs-secondary-color);
}

// "No level": the view toggle, with a zoom button beside it.
.level-view-row {
  display: flex;
  align-items: center;
  padding: 0 0.25rem 0 0;
}

.level-view-row:not(.active):hover {
  background: var(--bs-tertiary-bg);
}

.level-view-main {
  flex: 1;
  min-width: 0;
  padding: var(--bs-list-group-item-padding-y) var(--bs-list-group-item-padding-x);
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
}

.level-row {
  display: grid;
  grid-template-areas: "handle expand main refit zoom";
  grid-template-columns: 1.5rem auto minmax(0, 1fr) auto auto;
  align-items: start; // the buttons line up with the level's name, above its pills
  column-gap: 0.25rem;
  padding: 0.375rem 0.25rem;
}

.level-row:not(.active):hover {
  background: var(--bs-tertiary-bg);
}

.level-handle {
  grid-area: handle;
  display: flex;
  align-items: center;
  justify-content: center;
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
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
}

.level-heading {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  max-width: 100%;
}

.level-index {
  flex: none;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.level-title {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// The node and edge pills, on a line under the level's name.
.level-counts {
  display: flex;
  gap: 0.25rem;
}

.level-expand {
  grid-area: expand;
  display: flex;
  align-items: center;
  padding: 0;
  border: 0;
  color: inherit;
}

.level-expand:disabled {
  opacity: 0.3;
}

.level-refit {
  grid-area: refit;
  display: flex;
  align-items: center;
  padding: 0 0.25rem;
  border: 0;
  color: inherit;
}

.level-refit:disabled {
  opacity: 0.35;
}

// Much bigger than its stops need: styled like the warnings.
.level-refit-needed {
  background: #ffc;
  box-shadow: inset 0 0 0 1px #fb2;
  color: #b15500;
}

.level-refit-needed:hover {
  background: #fafa30;
  color: #7f3d00;
}

.level-zoom {
  grid-area: zoom;
  display: flex;
  align-items: center;
  padding: 0 0.25rem;
  border: 0;
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
</style>
