import { projectWizardClient } from '~/services/index';
import {
  PROJECT_WIZARD_TASK_AREA_DEFAULT,
  buildProjectWizardTaskPreviewFeatureCollection,
  createProjectWizardTaskAoiSignature,
  getProjectWizardTaskPreviewSummary,
  normalizeTaskAreaSquareKilometers,
} from '~/services/project-wizard-tasks';

import type { Ref } from 'vue';
import type {
  ProjectWizardAreaFeature,
  ProjectWizardCreatedProjectCheckpoint,
  ProjectWizardStepId,
  ProjectWizardTaskGenerationSummary,
} from '~/types/project-wizard';
import type { WorkspaceId } from '~/types/workspaces';

interface UseProjectWizardTasksOptions {
  aoi: Ref<ProjectWizardAreaFeature | null>;
  createdProject: Ref<ProjectWizardCreatedProjectCheckpoint | null>;
  currentStep: Ref<ProjectWizardStepId>;
  workspaceId: WorkspaceId;
}

export function useProjectWizardTasks(options: UseProjectWizardTasksOptions) {
  const generatingTasks = ref(false);
  const taskAreaSquareKilometers = ref(PROJECT_WIZARD_TASK_AREA_DEFAULT);
  const generatedTaskSummary = ref<ProjectWizardTaskGenerationSummary | null>(null);

  const currentTaskAreaSquareKilometers = computed(() =>
    normalizeTaskAreaSquareKilometers(taskAreaSquareKilometers.value),
  );

  const taskPreviewGrid = computed(() =>
    buildProjectWizardTaskPreviewFeatureCollection(
      options.aoi.value,
      currentTaskAreaSquareKilometers.value,
    ),
  );

  const taskPreviewSummary = computed(() =>
    getProjectWizardTaskPreviewSummary(
      options.aoi.value,
      currentTaskAreaSquareKilometers.value,
    ),
  );

  const currentAoiSignature = computed(() =>
    createProjectWizardTaskAoiSignature(options.aoi.value),
  );

  const isTasksStepActive = computed(() => options.currentStep.value === 'tasks');

  function updateTaskAreaSquareKilometers(value: number) {
    taskAreaSquareKilometers.value = normalizeTaskAreaSquareKilometers(value);
  }

  function resetTaskGeneration() {
    taskAreaSquareKilometers.value = PROJECT_WIZARD_TASK_AREA_DEFAULT;
    generatedTaskSummary.value = null;
  }

  async function generateTasks() {
    if (!options.aoi.value || !options.createdProject.value) {
      return null;
    }

    generatingTasks.value = true;

    try {
      const nextSummary = await projectWizardClient.generateProjectTasks(
        options.workspaceId,
        options.createdProject.value.projectId,
        options.aoi.value,
        currentTaskAreaSquareKilometers.value,
      );

      generatedTaskSummary.value = nextSummary;
      return nextSummary;
    }
    finally {
      generatingTasks.value = false;
    }
  }

  watch(
    [currentTaskAreaSquareKilometers, currentAoiSignature],
    () => {
      const summary = generatedTaskSummary.value;

      if (!summary) {
        return;
      }

      if (summary.aoiSignature !== currentAoiSignature.value) {
        generatedTaskSummary.value = null;
        return;
      }

      if (Math.abs(summary.requestedTaskAreaSquareKilometers - currentTaskAreaSquareKilometers.value) > Number.EPSILON) {
        generatedTaskSummary.value = null;
      }
    },
  );

  watch(
    () => options.createdProject.value?.projectId ?? '',
    (projectId, previousProjectId) => {
      if (!projectId || projectId !== previousProjectId) {
        resetTaskGeneration();
      }
    },
    { immediate: true },
  );

  return {
    currentTaskAreaSquareKilometers,
    generatedTaskSummary,
    generateTasks,
    generatingTasks,
    isTasksStepActive,
    resetTaskGeneration,
    taskPreviewGrid,
    taskPreviewSummary,
    updateTaskAreaSquareKilometers,
  };
}
