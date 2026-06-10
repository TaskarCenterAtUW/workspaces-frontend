<template>
  <button :class="getClasses()" :aria-label="`Select workspace ${workspace.title}, ID ${workspace.id}`">
    <div class="workspace-card-main">
      <div class="workspace-names">
        <img class="workspace-type-icon" :src="typeIconSrc" alt="" />

        <div class="workspace-copy">
          <div class="workspace-meta-row">
            <span class="workspace-type">{{ formatTypeLabel(workspace.type) }}</span>

            <span v-if="workspace.externalAppAccess > 0" class="workspace-status workspace-status-success">
              <app-icon variant="lock" /> App Access
            </span>

            <span v-if="workspace.role === 'lead'" class="workspace-status">
              <app-icon variant="star" /> {{ ROLE_LABELS.lead }}
            </span>
            <span v-else-if="workspace.role === 'validator'" class="workspace-status">
              <app-icon variant="task_alt" /> {{ ROLE_LABELS.validator }}
            </span>
          </div>

          <div class="workspace-title" :title="workspace.title">
            <span>{{ workspace.title }}</span>
          </div>
        </div>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import flexTypeIcon from '~/assets/img/flex-type.svg'
import oswTypeIcon from '~/assets/img/osw-type.svg'
import pathwaysTypeIcon from '~/assets/img/pathways-type.svg'
import { ROLE_LABELS } from '~/util/roles';

const props = defineProps({
  workspace: {
    type: Object,
    required: true
  },
  selected: {
    type: Boolean,
    default: false
  }
});

const typeIconSrc = computed(() => {
  const iconMap: Record<string, string> = {
    osw: oswTypeIcon,
    pathways: pathwaysTypeIcon,
    flex: flexTypeIcon,
  }

  return iconMap[props.workspace.type] ?? oswTypeIcon
})

function getClasses() {
  return {
    'workspace-card': true,
    'workspace-card-selected': props.selected,
  };
}

function formatTypeLabel(type: string) {
  return type.toUpperCase();
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";
.workspace-card {
  width: 100%;
  display: block;
  padding: 0;
  text-align: left;
  background: #ffffff;
  border: 1px solid #ddd;
  box-shadow: 0 1px 6px #33333314;
  border-radius: 5px;
  margin-bottom: 20px;
  border-left: 8px solid var(--tdei-blue);
  overflow: hidden;
  cursor: pointer;
}

.workspace-card-selected {
  border-left-color: var(--bs-primary);
  box-shadow: 0 8px 24px rgba(50, 0, 110, 0.14);
  position: sticky;
  top: 1rem;
  bottom: 1rem;
}

.workspace-card-main {
  padding: 20px 25px;
}

.workspace-names {
  display: flex;
  align-items: center;
}

.workspace-type-icon {
  height: 55px;
  margin-right: 15px;
}

.workspace-copy {
  min-width: 0;
}

.workspace-meta-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.workspace-type,
.workspace-status {
  font-size: 14px;
  font-weight: 400;
  background-color: #f2f2f2;
  display: inline-block;
  padding: 0 8px;
  border-radius: 4px;
  color: #333;
}

.workspace-status {
  font-weight: 600;
  text-transform: capitalize;
}

.workspace-status-success {
  background-color: #e8f4e0;
  color: #2d6a39;
}

.workspace-title {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  font-size: 16px;
  font-weight: 700;
  color: #21335b;
}

.workspace-title > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-id-inline {
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary-color);
  white-space: nowrap;
}

@include media-breakpoint-down(md) {
  .workspace-card {
    border-top: 5px solid var(--tdei-blue);
    border-left: 1px solid #ddd;
  }

  .workspace-card-selected {
    border-top-color: var(--bs-primary);
  }

  .workspace-card-main {
    padding: 15px;
  }

  .workspace-names {
    align-items: flex-start;
  }
}
</style>
