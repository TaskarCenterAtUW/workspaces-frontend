<template>
  <button :class="getClasses()">
    <div class="workspaceCardMain">
      <div class="workspaceNames">
        <img class="workspaceTypeIcon" :src="typeIconSrc" :alt="`${formatTypeLabel(workspace.type)} workspace type`" />

        <div class="workspaceCopy">
          <div class="workspaceMetaRow">
            <span class="workspaceType">{{ formatTypeLabel(workspace.type) }}</span>

            <span v-if="workspace.externalAppAccess > 0" class="workspaceStatus workspaceStatusSuccess">
              {{ workspace.externalAppAccess === 1 ? 'App Public' : 'App Private' }}
            </span>

            <span v-if="workspace.role === 'lead'" class="workspaceStatus">
              {{ ROLE_LABELS.lead }}
            </span>
            <span v-else-if="workspace.role === 'validator'" class="workspaceStatus">
              {{ ROLE_LABELS.validator }}
            </span>
          </div>

          <div class="workspaceTitle" :title="workspace.title">
            <span>{{ workspace.title }}</span>
            <span class="workspaceIdInline">ID: {{ workspace.id }}</span>
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
    workspaceCard: true,
    workspaceCardSelected: props.selected,
  };
}

function formatTypeLabel(type: string) {
  return type.toUpperCase();
}
</script>

<style lang="scss">
.workspaceCard {
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

.workspaceCardSelected {
  border-left-color: var(--primary-color);
  box-shadow: 0 8px 24px rgba(50, 0, 110, 0.14);
}

.workspaceCardMain {
  padding: 20px 25px;
}

.workspaceNames {
  display: flex;
  align-items: center;
}

.workspaceTypeIcon {
  height: 55px;
  margin-right: 15px;
}

.workspaceCopy {
  min-width: 0;
}

.workspaceMetaRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.workspaceType,
.workspaceStatus {
  font-size: 14px;
  font-weight: 400;
  background-color: #f2f2f2;
  display: inline-block;
  padding: 0 8px;
  border-radius: 4px;
  color: #333;
}

.workspaceStatus {
  font-weight: 600;
  text-transform: capitalize;
}

.workspaceStatusSuccess {
  background-color: #e8f4e0;
  color: #2d6a39;
}

.workspaceTitle {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  font-size: 16px;
  font-weight: 700;
  color: #21335b;
}

.workspaceTitle > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspaceIdInline {
  font-size: 13px;
  font-weight: 700;
  color: var(--secondary-color);
  white-space: nowrap;
}

@media only screen and (max-width: 768px) {
  .workspaceCard {
    border-top: 5px solid var(--tdei-blue);
    border-left: 1px solid #ddd;
  }

  .workspaceCardSelected {
    border-top-color: var(--primary-color);
  }

  .workspaceCardMain {
    padding: 15px;
  }

  .workspaceNames {
    align-items: flex-start;
  }
}
</style>
