<template>
  <!--
    Project card — used in the grid view on the workspace projects page.

    ACCESSIBILITY NOTE: The entire card is clickable but contains a nested action button.
    We use Bootstrap's "stretched-link" technique: the <nuxt-link> gets `position: absolute; inset: 0`
    (via the `project-card-link` class) making the whole card's surface area clickable,
    while the action button sits above it using `position: relative; z-index: 1`.
    This avoids the anti-pattern of putting @click on a non-interactive <article> element.
  -->
  <article class="project-card">
    <div class="project-card-top">
      <!-- Decorative project icon — alt="" intentionally empty as it conveys no extra info -->
      <img class="project-card-icon" :src="projectIcon" :alt="''">

      <!--
        Three-dot action button. `position: relative` + `z-index: 1` lets it receive clicks
        even though the stretched-link overlay sits beneath the whole card.
        `@click.stop` prevents the card-level navigation from also firing.
      -->
      <button
        class="project-card-menu btn btn-link"
        type="button"
        aria-label="Project actions"
        @click.stop
      >
        <app-icon variant="more_vert" size="22" no-margin />
      </button>
    </div>

    <div class="project-card-body">
      <h2 class="project-card-title" :title="project.name">
        {{ project.name }}
      </h2>

      <!-- Only render the summary paragraph when a value exists -->
      <p v-if="project.summary" class="project-card-summary">
        {{ project.summary }}
      </p>

      <workspace-projects-status-badge :status="project.status" />

      <!-- Task completion progress bar — values come from useProjectDisplay composable -->
      <div class="project-progress-copy">
        <strong>{{ taskSummary }}</strong>
        <span>{{ progressPercent }}%</span>
      </div>
      <div
        class="progress project-progress-bar"
        role="progressbar"
        :aria-valuenow="progressPercent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="progress-bar" :style="{ width: `${progressPercent}%` }" />
      </div>
    </div>

    <footer class="project-card-footer">
      <div>
        <span class="project-card-label">Created By</span>
        <strong>{{ project.createdByName }}</strong>
      </div>
      <div>
        <span class="project-card-label">Created Date</span>
        <strong>{{ createdDate }}</strong>
      </div>
    </footer>

    <!--
      Stretched link: covers the full card area via `position: absolute; inset: 0`.
      Screen readers announce this as the card's navigation target.
      Placed last in the DOM so the action button's z-index stacks above it without any hacks.
    -->
    <nuxt-link :to="projectRoute" class="project-card-link" :aria-label="`Open project ${project.name}`" />
  </article>
</template>

<script setup lang="ts">
import projectIcon from '~/assets/img/project.svg';

import type { WorkspaceProject } from '~/types/projects';
import { useProjectDisplay } from '~/composables/useProjectDisplay';

interface Props {
  project: WorkspaceProject;
}

const props = defineProps<Props>();

const { progressPercent, taskSummary, createdDate } = useProjectDisplay(
  computed(() => props.project),
);

/** The detail route for this project. Used by the stretched-link overlay. */
const projectRoute = computed(
  () => `/workspace/${props.project.workspaceId}/projects/${props.project.id}`,
);
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-card {
  /* `position: relative` is required for the stretched-link overlay to work correctly. */
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  cursor: pointer;
  background-color: #ffffff;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 0.8rem;
  box-shadow: 0 0.35rem 0.9rem rgba($text-navy, 0.08);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    border-color 160ms ease;
  overflow: hidden;
}

.project-card:hover,
.project-card:focus-within {
  border-color: rgba($text-navy, 0.18);
  box-shadow: 0 0.85rem 1.8rem rgba($text-navy, 0.12);
  transform: translateY(-2px);
}

/* Stretched-link overlay — makes the whole card surface clickable via the <nuxt-link>. */
.project-card-link {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;

  /* Suppress the default link underline/color since this element is visually invisible. */
  text-decoration: none;
  color: transparent;
}

/* Keep the action button above the stretched-link overlay so it remains independently clickable. */
.project-card-menu {
  position: relative;
  z-index: 1;
}

.project-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.2rem 1.2rem 0;
}

.project-card-icon {
  display: block;
  width: 2.8125rem;
  height: 2.8125rem;
  flex-shrink: 0;
}

.project-card-menu {
  padding: 0;
  color: #8b92ab;
  opacity: 1;
  text-decoration: none;
}

.project-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding: 0.9rem 1.2rem 1.3rem;
}

.project-card-title {
  display: -webkit-box;
  margin: 0;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.5;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.project-card-summary {
  display: -webkit-box;
  margin: 0;
  min-height: 4.6rem;
  color: rgba($secondary, 0.92);
  font-size: 0.92rem;
  line-height: 1.6;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}

.project-progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: rgba($secondary, 0.95);
  font-size: 0.95rem;
}

.project-progress-copy strong {
  font-weight: 600;
  color: $text-navy;
}

.project-progress-bar {
  height: 0.35rem;
  background-color: #e5e8f3;
}

.project-progress-bar .progress-bar {
  background-color: #4e5fe0;
  border-radius: 999px;
}

.project-card-footer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  padding: 0.95rem 1.2rem 1.05rem;
  border-top: 1px solid rgba($text-navy, 0.08);
}

.project-card-footer > div {
  min-width: 0;
}

.project-card-footer > div + div {
  padding-left: 0.9rem;
  border-left: 1px solid rgba($text-navy, 0.08);
}

.project-card-footer strong {
  display: block;
  min-width: 0;
  color: $text-navy;
  font-size: 0.95rem;
  font-weight: 400;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.project-card-label {
  display: block;
  margin-bottom: 0.1rem;
  color: rgba($secondary, 0.92);
  font-size: 0.85rem;
}
</style>
