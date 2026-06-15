import {
  PROJECT_WIZARD_TASK_AREA_DEFAULT,
  buildProjectWizardTaskPreviewFeatureCollection,
  createProjectWizardTaskAoiSignature,
  getProjectWizardTaskPreviewSummary,
  normalizeTaskAreaSquareKilometers,
  simulateProjectWizardTaskGeneration,
} from '~/services/project-wizard-tasks';

import type { Ref } from 'vue';
import type {
  ProjectWizardDraft,
  ProjectWizardStepId,
} from '~/types/project-wizard';

interface UseProjectWizardTasksOptions {
  currentStep: Ref<ProjectWizardStepId>;
  draft: ProjectWizardDraft;
}

export function useProjectWizardTasks(options: UseProjectWizardTasksOptions) {
  const generatingTasks = ref(false);

  const currentTaskAreaSquareKilometers = computed(() =>
    normalizeTaskAreaSquareKilometers(options.draft.tasks.taskAreaSquareKilometers),
  );

  const taskPreviewGrid = computed(() =>
    buildProjectWizardTaskPreviewFeatureCollection(
      options.draft.area.aoi,
      currentTaskAreaSquareKilometers.value,
    ),
  );

  const taskPreviewSummary = computed(() =>
    getProjectWizardTaskPreviewSummary(
      options.draft.area.aoi,
      currentTaskAreaSquareKilometers.value,
    ),
  );

  const currentAoiSignature = computed(() =>
    createProjectWizardTaskAoiSignature(options.draft.area.aoi),
  );

  const generatedTaskSummary = computed(() => {
    const summary = options.draft.tasks.generatedSummary;

    if (!summary) {
      return null;
    }

    if (summary.aoiSignature !== currentAoiSignature.value) {
      return null;
    }

    if (Math.abs(summary.requestedTaskAreaSquareKilometers - currentTaskAreaSquareKilometers.value) > Number.EPSILON) {
      return null;
    }

    return summary;
  });

  const isTasksStepActive = computed(() => options.currentStep.value === 'tasks');

  function updateTaskAreaSquareKilometers(value: number) {
    options.draft.tasks.taskAreaSquareKilometers = normalizeTaskAreaSquareKilometers(value);
  }

  function resetTaskGeneration() {
    options.draft.tasks.taskAreaSquareKilometers = PROJECT_WIZARD_TASK_AREA_DEFAULT;
    options.draft.tasks.generatedSummary = null;
  }

  async function generateTasks() {
    if (!options.draft.area.aoi) {
      return;
    }

    generatingTasks.value = true;

    try {
      options.draft.tasks.generatedSummary = await simulateProjectWizardTaskGeneration(
        options.draft.area.aoi,
        currentTaskAreaSquareKilometers.value,
      );
    }
    finally {
      generatingTasks.value = false;
    }
  }

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
