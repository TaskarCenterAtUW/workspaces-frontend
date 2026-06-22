<template>
  <!--
    ContributionsTab.vue — WORK IN PROGRESS / PLACEHOLDER

    This tab is designed to show:
      1. Contribution metric rings (mapped %, validated %, completed %)
      2. Count summary cards (total contributors, validators, mappers, leads)
      3. A filterable/searchable contributor list

    All of that UI is currently commented out below while the API contract is being finalised.
    The data model (props, computed values, styles) is already wired up and ready to go —
    un-comment the template sections when the API is available.

    To re-enable the full UI:
      1. Un-comment the <article v-for="metric in metrics"> block (metrics rings).
      2. Un-comment the <article v-for="item in countCards"> block (count cards).
      3. Un-comment the <section class="project-detail-contribution-list-card"> block (contributor list).
  -->
  <section class="project-detail-contributions">
    <div class="project-detail-contribution-metrics">
      <!-- <article v-for="metric in metrics" :key="metric.key" class="project-detail-contribution-metric">
        <div
          class="project-detail-contribution-ring"
          :style="{ '--metric-color': metric.color, '--metric-value': `${metric.percent}%` }"
          aria-hidden="true"
        />
        <div class="project-detail-contribution-copy">
          <h3>{{ metric.label }}</h3>
          <p>{{ metric.percent }}%</p>
        </div>
      </article> -->
    </div>

    <!-- <div class="project-detail-contribution-counts">
      <article v-for="item in countCards" :key="item.label" class="project-detail-contribution-count-card">
        <h3>{{ item.label }}</h3>
        <p>{{ item.value }}</p>
      </article>
    </div> -->

    <!-- <section class="project-detail-contribution-list-card">
      <header class="project-detail-contribution-list-header">
        <h2>Contributors</h2>

        <div class="project-detail-contribution-role-filter">
          <span>Role</span>
          <app-select
            id="project-detail-contributor-role"
            v-model="selectedRole"
            :options="roleOptions"
            :aria-label="'Filter contributors by role'"
          />
        </div>
      </header>

      <ul class="project-detail-contribution-list">
        <li v-for="contributor in filteredContributors" :key="contributor.id" class="project-detail-contribution-item">
          <div class="project-detail-contribution-avatar" aria-hidden="true">
            {{ contributor.name.charAt(0) }}
          </div>

          <div class="project-detail-contribution-person">
            <h3>{{ contributor.name }}</h3>
            <p>{{ contributor.email }}</p>
          </div>

          <span class="project-detail-contribution-role-pill">
            {{ formatRole(contributor.role) }}
          </span>
        </li>
      </ul>
    </section> -->
  </section>
</template>

<script setup lang="ts">
/**
 * ContributionsTab.vue
 *
 * Displays contributor statistics for a project.
 * All data is passed in as props from the parent page — this component is purely presentational.
 *
 * Props are already typed and the computed helpers below are ready.
 * The template is commented out pending API availability — see the template block for details.
 */
import type {
  WorkspaceProjectContributor,
  WorkspaceProjectContributorRole,
  WorkspaceProjectContributionMetric,
} from '~/types/projects';

type RoleFilter = WorkspaceProjectContributorRole | 'all';

interface SelectOption {
  label: string;
  value: string;
}

interface Props {
  /** Full list of project contributors. Passed from the page's `supplemental` computed. */
  contributors: WorkspaceProjectContributor[];
  /** Percentage-based metrics for the metric-ring visualisation. */
  metrics: WorkspaceProjectContributionMetric[];
}

const props = defineProps<Props>();

/** Currently selected role filter. 'all' shows every contributor. */
const selectedRole = ref<RoleFilter>('all');

const roleOptions: SelectOption[] = [
  { label: 'All', value: 'all' },
  { label: 'Validator', value: 'validator' },
  { label: 'Mapper', value: 'mapper' },
  { label: 'Lead', value: 'lead' },
];

/** Filtered list of contributors based on the selected role dropdown. */
const filteredContributors = computed(() =>
  props.contributors.filter(contributor =>
    selectedRole.value === 'all' || contributor.role === selectedRole.value,
  ),
);

/**
 * Aggregated count cards shown in the summary section.
 * `padStart(2, '0')` zero-pads single-digit numbers (e.g. "03") for a consistent visual width.
 */
const countCards = computed(() => {
  const validators = props.contributors.filter(contributor => contributor.role === 'validator').length;
  const mappers = props.contributors.filter(contributor => contributor.role === 'mapper').length;
  const leads = props.contributors.filter(contributor => contributor.role === 'lead').length;

  return [
    { label: 'Total Contributors', value: String(props.contributors.length).padStart(2, '0') },
    { label: 'Validators', value: String(validators).padStart(2, '0') },
    { label: 'Mappers', value: String(mappers).padStart(2, '0') },
    { label: 'Leads', value: String(leads).padStart(2, '0') },
  ];
});

function formatRole(role: WorkspaceProjectContributorRole) {
  switch (role) {
    case 'lead':
      return 'Lead';
    case 'mapper':
      return 'Mapper';
    case 'validator':
    default:
      return 'Validator';
  }
}
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.project-detail-contribution-metric,
.project-detail-contribution-count-card,
.project-detail-contribution-list-card {
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
.project-detail-contribution-count-card h3,
.project-detail-contribution-list-header h2,
.project-detail-contribution-person h3 {
  margin: 0;
  color: #1a1e3d;
  font-family: var(--secondary-font-family);
}

.project-detail-contribution-copy h3 {
  font-size: 1rem;
  font-weight: 600;
}

.project-detail-contribution-copy p,
.project-detail-contribution-count-card p,
.project-detail-contribution-person p {
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

.project-detail-contribution-list-card {
  padding: 1.25rem;
}

.project-detail-contribution-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.project-detail-contribution-list-header h2 {
  font-size: 1.2rem;
  font-weight: 700;
}

.project-detail-contribution-role-filter {
  display: grid;
  gap: 0.35rem;
  min-width: 8rem;
}

.project-detail-contribution-role-filter span {
  color: #5a607b;
  font-size: 0.9rem;
  font-weight: 600;
}

.project-detail-contribution-list-card :deep(.tdei-select-toggle),
.project-detail-contribution-list-card :deep(.tdei-select-menu) {
  border-radius: 0.75rem;
}

.project-detail-contribution-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-detail-contribution-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  padding: 1rem 0;
  border-top: 1px solid rgba($text-navy, 0.08);
}

.project-detail-contribution-item:first-child {
  border-top: 0;
}

.project-detail-contribution-avatar {
  width: 2.25rem;
  height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6d678e;
  font-size: 1rem;
  font-weight: 700;
  background: #efe7fb;
  border-radius: 50%;
}

.project-detail-contribution-person h3 {
  font-size: 1.05rem;
  font-weight: 700;
}

.project-detail-contribution-person p {
  font-size: 0.95rem;
}

.project-detail-contribution-role-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 6.8rem;
  padding: 0.45rem 0.8rem;
  color: #646c89;
  font-size: 0.92rem;
  background: #f4f6fb;
  border: 1px solid #dde3f1;
  border-radius: 999px;
}

@include media-breakpoint-down(xl) {
  .project-detail-contribution-metrics,
  .project-detail-contribution-counts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@include media-breakpoint-down(md) {
  .project-detail-contribution-list-header,
  .project-detail-contribution-item {
    grid-template-columns: 1fr;
  }

  .project-detail-contribution-list-header {
    align-items: stretch;
  }

  .project-detail-contribution-role-pill {
    justify-self: flex-start;
  }
}

@include media-breakpoint-down(sm) {
  .project-detail-contribution-metrics,
  .project-detail-contribution-counts {
    grid-template-columns: 1fr;
  }

  .project-detail-contribution-list-card {
    padding: 1rem;
  }
}
</style>
