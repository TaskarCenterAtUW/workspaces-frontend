<template>
  <section
    class="workspace-information"
    aria-labelledby="workspace-information-title"
  >
    <header class="workspace-information-header">
      <h2 id="workspace-information-title">Workspace Information</h2>
      <div
        class="workspace-information-project-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        :aria-label="`Total projects: ${projectCountValue}`"
      >
        <img
          :src="projectsIcon"
          alt=""
        >
        <strong>{{ projectCountValue }}</strong>
        <span>{{ projectCountNoun }}</span>
      </div>
      <div class="workspace-information-version">
        <span>TDEI Dataset Version</span>
        <strong>{{ datasetVersion }}</strong>
      </div>
    </header>

    <dl class="workspace-information-grid">
      <div
        v-for="(column, columnIndex) in informationColumns"
        :key="columnIndex"
        class="workspace-information-column"
      >
        <div
          v-for="item in column"
          :key="item.label"
          class="workspace-information-item"
        >
          <dt>{{ item.label }}</dt>
          <dd :title="item.value">{{ item.value }}</dd>
        </div>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import projectsIcon from '~/assets/img/projects.svg';
import { formatShort } from '~/util/time';
import { isRecord, parseMetadata } from '~/util/metadata';

import type { Workspace, WorkspaceRole } from '~/types/workspaces';

interface Props {
  myTdeiRoles: string[];
  workspace: Workspace;
}

interface InformationItem {
  label: string;
  value: string;
}

const props = defineProps<Props>();

const roleLabels: Record<WorkspaceRole, string> = {
  contributor: 'Member',
  lead: 'Owner',
  validator: 'Validator',
};

const appAccessLabels: Record<Workspace['externalAppAccess'], string> = {
  0: 'Disabled',
  1: 'Public',
  2: 'Project Group Only',
};

const projectCountValue = computed(() =>
  props.workspace.projectsCount == null
    ? '—'
    : props.workspace.projectsCount.toLocaleString()
);
const projectCountNoun = computed(() =>
  props.workspace.projectsCount === 1 ? 'Project' : 'Projects'
);
const parsedMetadata = computed(() => parseMetadata(props.workspace.tdeiMetadata));
const datasetVersion = computed(() => getDatasetVersion(parsedMetadata.value));

const roleLabel = computed(() => {
  const labels: string[] = [];

  if (props.myTdeiRoles.includes('poc')) {
    labels.push('POC');
  }

  if (props.myTdeiRoles.includes(`${props.workspace.type}_data_generator`)) {
    labels.push('Data Generator');
  }

  labels.push(props.workspace.role ? roleLabels[props.workspace.role] : 'Member');

  return [...new Set(labels)].join(', ');
});

const informationColumns = computed<InformationItem[][]>(() => [
  [
    {
      label: 'Updated At',
      value: formatShort(props.workspace.updatedAt ?? props.workspace.createdAt)
    },
    { label: 'Created By', value: props.workspace.createdByName || 'N/A' }
  ],
  [
    { label: 'My Role', value: roleLabel.value },
    { label: 'App Access', value: appAccessLabels[props.workspace.externalAppAccess] }
  ],
  [
    { label: 'From TDEI Dataset ID', value: props.workspace.tdeiRecordId ?? 'N/A' },
    { label: 'TDEI Project Group ID', value: props.workspace.tdeiProjectGroupId }
  ]
]);

function getDatasetVersion(metadata: Record<string, unknown> | null): string {
  if (metadata == null) {
    return 'N/A';
  }

  const metadataDetails = metadata.metadata;
  if (!isRecord(metadataDetails)) {
    return 'N/A';
  }

  const datasetDetail = metadataDetails.dataset_detail;
  if (!isRecord(datasetDetail)) {
    return 'N/A';
  }

  const version = datasetDetail.version;
  return typeof version === 'string' || typeof version === 'number'
    ? String(version)
    : 'N/A';
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

$workspace-information-padding: 0.55rem 0.7rem;
$workspace-information-gap: 0.4rem;
$workspace-information-column-gap: 0.6rem;
$workspace-information-radius: 0.65rem;
$workspace-information-text-size: 0.9rem;
$workspace-information-title-size: 0.975rem;
$workspace-information-meta-size: 0.875rem;

.workspace-information {
  padding: $workspace-information-padding;
  border: $border-width solid $border-color;
  border-radius: $workspace-information-radius;
}

.workspace-information-header {
  margin-bottom: 0.7rem;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.workspace-information-header h2 {
  margin: 0;
  color: $text-secondary;
  font-family: var(--primary-font-family);
  font-size: $workspace-information-title-size;
  font-weight: $font-weight-bold;
  line-height: 1.2222;
}

.workspace-information-project-count {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: $text-secondary;
  font-family: var(--primary-font-family);
  font-size: $workspace-information-meta-size;
  line-height: 1.25;
}

.workspace-information-project-count img {
  width: 1.75rem;
  height: 1.75rem;
  margin-right: 0.15rem;
}

.workspace-information-project-count strong {
  color: $text-navy;
  font-weight: $font-weight-semibold;
}

.workspace-information-project-count span {
  font-weight: $font-weight-normal;
}

.workspace-information-version {
  padding-left: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: $text-secondary;
  font-family: var(--primary-font-family);
  font-size: $workspace-information-meta-size;
  line-height: 1.25;
  border-left: $border-width solid $border-subtle;
}

.workspace-information-version span {
  font-weight: $font-weight-normal;
}

.workspace-information-version strong {
  color: $text-navy;
  font-weight: $font-weight-semibold;
}

.workspace-information-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: $workspace-information-gap $workspace-information-column-gap;
}

.workspace-information-column {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 0.75rem;
}

.workspace-information-item dt {
  margin-bottom: 0.25rem;
  color: $text-navy;
  font-family: var(--primary-font-family);
  font-size: $workspace-information-text-size;
  font-weight: $font-weight-semibold;
  line-height: 1.2222;
}

.workspace-information-item dd {
  margin: 0;
  overflow: hidden;
  color: $text-secondary;
  font-family: var(--primary-font-family);
  font-size: $workspace-information-text-size;
  font-weight: $font-weight-normal;
  line-height: 1.2222;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@include media-breakpoint-down(lg) {
  .workspace-information-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@include media-breakpoint-down(sm) {
  .workspace-information-grid {
    grid-template-columns: 1fr;
  }
}
</style>
