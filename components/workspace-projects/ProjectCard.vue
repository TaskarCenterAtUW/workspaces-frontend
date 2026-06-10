<template>
  <article class="project-card">
    <div class="project-card-top">
      <div class="project-card-icon">
        <app-icon variant="crop_free" size="24" no-margin />
      </div>

      <button
        class="project-card-menu btn btn-link"
        type="button"
        aria-label="Project actions"
      >
        <app-icon variant="more_vert" size="22" no-margin />
      </button>
    </div>

    <div class="project-card-body">
      <h2 class="project-card-title" :title="project.name">
        {{ project.name }}
      </h2>
      <p v-if="project.summary" class="project-card-summary">
        {{ project.summary ?? '' }}
      </p>

      <workspace-projects-status-badge :status="project.status" />

      <div class="project-progress-copy">
        <strong>{{ taskSummary }}</strong>
        <span>{{ progressPercent }}%</span>
      </div>
      <div class="progress project-progress-bar" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
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
  </article>
</template>

<script setup lang="ts">
import type { WorkspaceProject } from '~/types/projects';
import { useProjectDisplay } from '~/composables/useProjectDisplay';

interface Props {
  project: WorkspaceProject;
}

const props = defineProps<Props>();

const { progressPercent, completedTaskCount, taskSummary, createdDate } = useProjectDisplay(
  computed(() => props.project),
);
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #ffffff;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 0.8rem;
  box-shadow: 0 0.35rem 0.9rem rgba($text-navy, 0.08);
  overflow: hidden;
}

.project-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.2rem 1.2rem 0;
}

.project-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 0.65rem;
  background-color: #f1f3fb;
  color: #6d7593;
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

.project-card-footer > div + div {
  padding-left: 0.9rem;
  border-left: 1px solid rgba($text-navy, 0.08);
}

.project-card-footer strong {
  display: block;
  color: $text-navy;
  font-size: 0.95rem;
  font-weight: 400;
}

.project-card-label {
  display: block;
  margin-bottom: 0.1rem;
  color: rgba($secondary, 0.92);
  font-size: 0.85rem;
}
</style>
