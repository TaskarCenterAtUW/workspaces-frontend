<template>
  <section
    class="workspace-information"
    aria-labelledby="workspace-information-title"
  >
    <h2 id="workspace-information-title">Workspace Information</h2>

    <dl class="workspace-information-grid">
      <div
        v-for="item in informationItems"
        :key="item.label"
        :class="[
          'workspace-information-item',
          `workspace-information-item-${item.width}`
        ]"
      >
        <dt>{{ item.label }}</dt>
        <dd :title="item.value">{{ item.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { formatShort } from '~/util/time';

import type { Workspace, WorkspaceRole } from '~/types/workspaces';

interface Props {
  myTdeiRoles: string[];
  workspace: Workspace;
}

interface InformationItem {
  label: string;
  value: string;
  width: 'compact' | 'standard' | 'wide';
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

const roleLabel = computed(() => {
  if (props.myTdeiRoles.includes('poc')) {
    return 'POC';
  }

  if (props.myTdeiRoles.includes(`${props.workspace.type}_data_generator`)) {
    return 'Data Generator';
  }

  return props.workspace.role ? roleLabels[props.workspace.role] : 'Member';
});

const informationItems = computed<InformationItem[]>(() => [
  { label: 'Created At', value: formatShort(props.workspace.createdAt), width: 'standard' },
  { label: 'Created By', value: props.workspace.createdByName || 'N/A', width: 'standard' },
  { label: 'My Role', value: roleLabel.value, width: 'standard' },
  { label: 'App Access', value: appAccessLabels[props.workspace.externalAppAccess], width: 'standard' },
  { label: 'From TDEI Dataset ID', value: props.workspace.tdeiRecordId ?? 'N/A', width: 'wide' },
  { label: 'TDEI Project Group ID', value: props.workspace.tdeiProjectGroupId, width: 'wide' },
  {
    label: 'TDEI Dataset Version',
    value: getDatasetVersion(props.workspace.tdeiMetadata),
    width: 'compact',
  },
]);

function getDatasetVersion(metadata: unknown): string {
  if (!isRecord(metadata)) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

$workspace-information-padding: 0.65rem 0.85rem;
$workspace-information-gap: 0.5rem;
$workspace-information-column-gap: 0.75rem;
$workspace-information-radius: 0.65rem;
$workspace-information-heading-size: 1rem;
$workspace-information-label-size: 0.88rem;
$workspace-information-value-size: 0.9rem;

.workspace-information {
  padding: $workspace-information-padding;
  border: $border-width solid $border-color;
  border-radius: $workspace-information-radius;
}

.workspace-information h2 {
  margin: 0 0 0.45rem;
  color: $secondary;
  font-family: var(--secondary-font-family);
  font-size: $workspace-information-heading-size;
  font-weight: $font-weight-semibold;
}

.workspace-information-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: $workspace-information-gap $workspace-information-column-gap;
}

.workspace-information-item {
  min-width: 0;
  grid-column: span 3;
}

.workspace-information-item-wide {
  grid-column: span 5;
}

.workspace-information-item-compact {
  grid-column: span 2;
}

.workspace-information-item dt {
  margin-bottom: 0.25rem;
  color: $text-navy;
  font-size: $workspace-information-label-size;
  font-weight: $font-weight-semibold;
}

.workspace-information-item dd {
  margin: 0;
  overflow: hidden;
  color: $secondary;
  font-size: $workspace-information-value-size;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-information-item-wide dd {
  overflow: visible;
  font-size: $workspace-information-label-size;
  text-overflow: clip;
}

@include media-breakpoint-down(lg) {
  .workspace-information-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .workspace-information-item,
  .workspace-information-item-wide,
  .workspace-information-item-compact {
    grid-column: auto;
  }
}

@include media-breakpoint-down(sm) {
  .workspace-information-grid {
    grid-template-columns: 1fr;
  }
}
</style>
