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
          v-for="level in levels"
          :key="level.levelId"
          class="level-row"
        >
          <button
            type="button"
            role="radio"
            class="list-group-item list-group-item-action level-row-main"
            :class="{ active: currentLevelId === level.levelId }"
            :aria-checked="currentLevelId === level.levelId"
            @click="tools.showLevel(level.levelId)"
          >
            <span class="level-index">{{ level.index ?? '?' }}</span>
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
        v-if="levels.some(level => !level.areaIds.length)"
        class="level-panel-hint"
      >
        Levels with no outline are only used by stops so far; draw one to give them an area (and an index, if "?").
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
import type { Level } from '~/services/pathways-levels';

// @test unit: "Add level" starts drawing a new level's outline on the map
// @test unit: each level shows whether it has an outline; levels without one can have one drawn
// @test unit: level areas missing a level_id are flagged, and "Fill level_id" generates one
// @test unit: lists levels in level_index order, with an "All levels" option, and selecting one shows only that level
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

.level-index {
  min-width: 1.75rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
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
