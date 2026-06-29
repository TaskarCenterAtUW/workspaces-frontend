<template>
  <section class="project-detail-contributions">
    <div v-if="metrics.length > 0" class="project-detail-contribution-metrics">
      <article v-for="metric in metrics" :key="metric.key" class="project-detail-contribution-metric">
        <div
          class="project-detail-contribution-ring"
          :style="{ '--metric-color': metric.color, '--metric-value': `${metric.percent}%` }"
          aria-hidden="true"
        />
        <div class="project-detail-contribution-copy">
          <h3>{{ metric.label }}</h3>
          <p>{{ metric.percent }}%</p>
        </div>
      </article>
    </div>

    <div class="project-detail-contribution-counts">
      <article v-for="item in countCards" :key="item.label" class="project-detail-contribution-count-card">
        <h3>{{ item.label }}</h3>
        <p>{{ item.value }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  WorkspaceProjectContributor,
  WorkspaceProjectContributionMetric,
} from '~/types/projects';

interface Props {
  contributors: WorkspaceProjectContributor[];
  metrics: WorkspaceProjectContributionMetric[];
}

const props = defineProps<Props>();

/**
 * Aggregated count cards shown in the summary section.
 * `padStart(2, '0')` zero-pads single-digit numbers (e.g. "03") for a consistent visual width.
 */
const countCards = computed(() => {
  const contributors = props.contributors.filter(contributor => contributor.role === 'contributor').length;
  const leads = props.contributors.filter(contributor => contributor.role === 'lead').length;
  const validators = props.contributors.filter(contributor => contributor.role === 'validator').length;

  return [
    { label: 'Total Contributors', value: String(props.contributors.length).padStart(2, '0') },
    { label: 'Leads', value: String(leads).padStart(2, '0') },
    { label: 'Validators', value: String(validators).padStart(2, '0') },
    { label: 'Contributors', value: String(contributors).padStart(2, '0') },
  ];
});
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-detail-contributions {
  display: grid;
  gap: 1rem;
}

.project-detail-contribution-metrics,
.project-detail-contribution-counts {
  display: grid;
  gap: 1rem;
}

.project-detail-contribution-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.project-detail-contribution-counts {
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
}

.project-detail-contribution-metric,
.project-detail-contribution-count-card {
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 1rem;
  box-shadow: 0 0.75rem 2rem rgba($text-navy, 0.08);
}

.project-detail-contribution-metric {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.1rem;
}

.project-detail-contribution-ring {
  width: 3.25rem;
  height: 3.25rem;
  flex-shrink: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, #ffffff 59%, transparent 60%),
    conic-gradient(var(--metric-color) var(--metric-value), #e8ebf5 0);
}

.project-detail-contribution-copy h3,
.project-detail-contribution-count-card h3 {
  margin: 0;
  color: #1a1e3d;
  font-family: var(--secondary-font-family);
}

.project-detail-contribution-copy h3 {
  font-size: 1rem;
  font-weight: 600;
}

.project-detail-contribution-copy p,
.project-detail-contribution-count-card p {
  margin: 0.2rem 0 0;
  color: #5a607b;
}

.project-detail-contribution-copy p,
.project-detail-contribution-count-card p {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.2;
}

.project-detail-contribution-count-card {
  padding: 1rem;
}

.project-detail-contribution-count-card h3 {
  font-size: 0.98rem;
  font-weight: 500;
}

.project-detail-contribution-summary-card {
  padding: 1.25rem;
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 1rem;
  box-shadow: 0 0.75rem 2rem rgba($text-navy, 0.08);
}

.project-detail-contribution-summary-card h2 {
  margin: 0;
  color: #1a1e3d;
  font-size: 1.2rem;
  font-family: var(--secondary-font-family);
  font-weight: 700;
}

.project-detail-contribution-summary-card p {
  margin: 0;
  margin-top: 0.5rem;
  color: #5a607b;
  font-size: 0.98rem;
  line-height: 1.55;
}

@include media-breakpoint-down(xl) {
  .project-detail-contribution-metrics,
  .project-detail-contribution-counts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@include media-breakpoint-down(sm) {
  .project-detail-contribution-metrics,
  .project-detail-contribution-counts {
    grid-template-columns: 1fr;
  }

  .project-detail-contribution-summary-card {
    padding: 1rem;
  }
}
</style>
