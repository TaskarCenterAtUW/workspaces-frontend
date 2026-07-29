<template>
  <!--
    Project list row — used in the list view on the workspace projects page.

    Same stretched-link technique as ProjectCard.vue:
    The <nuxt-link> overlay (`project-list-link`) covers the entire row.
  -->
  <article class="project-list-row">
    <div class="project-list-title-cell">
      <div class="project-list-title tdei-list-title">
        {{ project.name }}
      </div>
    </div>

    <div class="project-list-status-cell">
      <workspace-projects-status-badge :status="project.status" />
    </div>

    <div class="project-list-detail-cell">
      <span class="project-list-label tdei-list-meta-label">Created By</span>
      <div class="project-list-value tdei-list-meta-value">{{ project.createdByName }}</div>
    </div>

    <div class="project-list-detail-cell">
      <span class="project-list-label tdei-list-meta-label">Created Date</span>
      <div class="project-list-value tdei-list-meta-value">{{ createdDate }}</div>
    </div>

    <div class="project-list-progress-cell">
      <div class="project-list-progress-copy tdei-list-progress-copy">
        <strong>{{ taskSummary }}</strong>
        <span>{{ progressPercent }}%</span>
      </div>
      <div
        class="progress project-list-progress-bar"
        role="progressbar"
        :aria-valuenow="progressPercent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="progress-bar"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
    </div>

    <!-- Stretched-link overlay: makes the full row surface navigate to the project detail page. -->
    <nuxt-link
      :to="projectRoute"
      class="project-list-link"
      :aria-label="`Open project ${project.name}`"
    />
  </article>
</template>

<script setup lang="ts">
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

.project-list-row {
  /* `position: relative` is required for the stretched-link overlay. */
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 2.9fr) minmax(8.5rem, 1.1fr) minmax(12rem, 1.35fr) minmax(11rem, 1.2fr) minmax(15rem, 1.6fr);
  gap: 1.5rem;
  align-items: start;
  padding: 25px 10px;
  cursor: pointer;
  border-bottom: 1px solid rgba($text-navy, 0.08);
  transition: background-color 160ms ease;
}

.project-list-row:last-child {
  border-bottom: 0;
}

.project-list-row:hover,
.project-list-row:focus-within {
  background: rgba(244, 240, 251, 0.44);
}

/* Stretched-link overlay — same technique as ProjectCard.vue. */
.project-list-link {
  position: absolute;
  inset: 0;
  z-index: 0;
  text-decoration: none;
  color: transparent;
}

.project-list-title {
  margin: 0;
}

.project-list-detail-cell {
  display: grid;
  gap: 0.35rem;
}

.project-list-progress-cell {
  display: grid;
  align-content: start;
  gap: 15px;
  padding-top: 0.05rem;
}

.project-list-progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.project-list-progress-bar {
  height: 0.36rem;
  background-color: #e5e8f3;
}

.project-list-progress-bar .progress-bar {
  background-color: #4e5fe0;
  border-radius: 999px;
}

@include media-breakpoint-down(xl) {
  .project-list-row {
    grid-template-columns: minmax(0, 2.2fr) minmax(8rem, 1fr) minmax(10rem, 1.2fr) minmax(9rem, 1fr) minmax(12rem, 1.35fr);
    gap: 1.15rem;
  }
}

@include media-breakpoint-down(lg) {
  .project-list-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1rem 1.25rem;
    padding: 1.5rem 0;
  }

  .project-list-title-cell,
  .project-list-progress-cell {
    grid-column: 1 / -1;
  }
}

@include media-breakpoint-down(sm) {
  .project-list-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
