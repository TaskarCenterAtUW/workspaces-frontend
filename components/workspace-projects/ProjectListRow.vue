<template>
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
        <div class="progress-bar" :style="{ width: `${progressPercent}%` }" />
      </div>
    </div>

    <div class="project-list-actions-cell">
      <button
        class="project-list-menu-button btn btn-link"
        type="button"
        aria-label="Project actions"
      >
        <app-icon variant="more_vert" size="22" no-margin />
      </button>
    </div>
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
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-list-row {
  display: grid;
  grid-template-columns: minmax(0, 2.9fr) minmax(8.5rem, 1.1fr) minmax(12rem, 1.35fr) minmax(11rem, 1.2fr) minmax(15rem, 1.6fr) 2.25rem;
  gap: 1.5rem;
  align-items: start;
  padding: 2.2rem 0;
  border-bottom: 1px solid rgba($text-navy, 0.08);
}

.project-list-row:last-child {
  border-bottom: 0;
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
  gap: 0.7rem;
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

.project-list-actions-cell {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.1rem;
}

.project-list-menu-button {
  padding: 0;
  color: #8b92ab;
  text-decoration: none;
}

@include media-breakpoint-down(xl) {
  .project-list-row {
    grid-template-columns: minmax(0, 2.2fr) minmax(8rem, 1fr) minmax(10rem, 1.2fr) minmax(9rem, 1fr) minmax(12rem, 1.35fr) 2rem;
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

  .project-list-actions-cell {
    justify-content: flex-start;
  }
}

@include media-breakpoint-down(sm) {
  .project-list-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
