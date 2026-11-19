/**
 * useProjectTasking.ts
 *
 * Composable that manages the full task generation and save workflow for a project.
 * Used on both the project detail page (for projects without tasks yet) and could
 * also be used on the project-wizard create flow.
 *
 * Workflow:
 *   1. User moves the slider → `updateTaskAreaSquareKilometers` is called.
 *   2. `taskPreviewGrid` updates reactively, showing a live grid preview on the map.
 *   3. User clicks "Generate Tasks" → `generateTasks()` calls the API to create a server-side grid.
 *   4. `generatedTaskSummary` is populated → map switches to showing the API grid.
 *   5. If the clipped grid has tasks below the small-task threshold (slivers at the boundary),
 *      the user chooses to remove (default) or keep them via `discardSmallTasks`.
 *   6. User clicks "Save Tasks" → `saveTasks()` commits the grid (minus any removed small
 *      tasks) to the project permanently.
 *   7. `savedTaskSummary` is populated → the setup UI hides and the real task list appears.
 *
 * State invalidation:
 *   - If the user changes the task area or the AOI changes after generating, the generated
 *     summary is automatically cleared so they must re-generate before saving.
 *   - If the projectId changes (e.g. navigating to a different project), everything resets.
 */
import { projectWizardClient } from '~/services/index';
import {
  PROJECT_WIZARD_TASK_AREA_DEFAULT,
  buildProjectWizardTaskPreviewFeatureCollection,
  createProjectWizardTaskAoiSignature,
  getProjectWizardTaskPreviewSummary,
  normalizeTaskAreaSquareKilometers,
  partitionSmallTasks,
} from '~/services/project-wizard-tasks';

import type { Ref } from 'vue';
import type {
  ProjectWizardAreaFeature,
  ProjectWizardGeneratedTaskFeatureCollection,
  ProjectWizardTaskGenerationSummary,
  ProjectWizardTaskSaveSummary,
} from '~/types/project-wizard';
import type { WorkspaceId } from '~/types/workspaces';

interface UseProjectTaskingOptions {
  /** Reactive ref to the project's AOI feature. The composable watches this for changes. */
  aoi: Ref<ProjectWizardAreaFeature | null>;
  /** Reactive ref to the project ID string. Resets all task state when it changes. */
  projectId: Ref<string>;
  /** The workspace ID. Non-reactive since it doesn't change during the component's lifetime. */
  workspaceId: WorkspaceId;
}

export function useProjectTasking(options: UseProjectTaskingOptions) {
  const generatingTasks = ref(false);
  const savingTasks = ref(false);
  /** Raw slider value. Always normalised before being used or sent to the API. */
  const taskAreaSquareKilometers = ref(PROJECT_WIZARD_TASK_AREA_DEFAULT);
  /** Populated after a successful `generateTasks()` call. Cleared if area/AOI changes. */
  const generatedTaskSummary = ref<ProjectWizardTaskGenerationSummary | null>(null);
  /** Populated after a successful `saveTasks()` call. Once set, the workflow is complete. */
  const savedTaskSummary = ref<ProjectWizardTaskSaveSummary | null>(null);
  /** Whether tasks below the small-task threshold are dropped before saving. Reset on each generate. */
  const discardSmallTasks = ref(true);

  /** The task area value clamped/snapped to valid bounds. Always use this rather than the raw ref. */
  const currentTaskAreaSquareKilometers = computed(() =>
    normalizeTaskAreaSquareKilometers(taskAreaSquareKilometers.value),
  );

  /**
   * Client-side live preview grid, recalculated instantly as the slider moves.
   * This is purely local — it's not sent to the API. Its purpose is to give the user
   * immediate visual feedback on the map before they click "Generate Tasks".
   */
  const taskPreviewGrid = computed(() =>
    buildProjectWizardTaskPreviewFeatureCollection(
      options.aoi.value,
      currentTaskAreaSquareKilometers.value,
    ),
  );

  /**
   * Summary data for the preview (e.g. estimated task count).
   * Used to populate the helper text below the slider and to gate the Generate button.
   */
  const taskPreviewSummary = computed(() =>
    getProjectWizardTaskPreviewSummary(
      options.aoi.value,
      currentTaskAreaSquareKilometers.value,
    ),
  );

  /**
   * A lightweight fingerprint of the current AOI geometry (e.g. a hash of its coordinates).
   * We compare this against the signature stored in `generatedTaskSummary` to detect
   * whether the AOI has changed since the last generate — if it has, we invalidate the grid.
   */
  const currentAoiSignature = computed(() =>
    createProjectWizardTaskAoiSignature(options.aoi.value),
  );

  /** Convenience accessor: the task grid from the generate API response. */
  const generatedTaskGrid = computed(() => generatedTaskSummary.value?.taskGrid ?? null);
  /** The generated tasks split into small slivers and regular-sized tasks. */
  const generatedTaskPartition = computed(() => partitionSmallTasks(generatedTaskGrid.value));
  /** Tasks in the generated grid below the small-task threshold. */
  const smallTaskCount = computed(() => generatedTaskPartition.value.smallTasks.length);
  /** The grid that `saveTasks()` will send: small tasks are left out when `discardSmallTasks` is on. */
  const taskGridToSave = computed<ProjectWizardGeneratedTaskFeatureCollection | null>(() => {
    const grid = generatedTaskGrid.value;

    if (!grid || !discardSmallTasks.value || smallTaskCount.value === 0) {
      return grid;
    }

    return { ...grid, features: generatedTaskPartition.value.regularTasks };
  });
  /** How many tasks will be saved, after any small-task removal. */
  const taskCountToSave = computed(() =>
    taskGridToSave.value?.features.filter(feature => feature.geometry.type === 'Polygon').length ?? 0,
  );
  /**
   * The generated grid for the map, with small tasks flagged (`smallTask: true`) so they can be
   * highlighted whether they are being kept or removed.
   */
  const generatedTaskGridForDisplay = computed<ProjectWizardGeneratedTaskFeatureCollection | null>(() => {
    const grid = generatedTaskGrid.value;

    if (!grid || smallTaskCount.value === 0) {
      return grid;
    }

    const smallTasks = new Set(generatedTaskPartition.value.smallTasks);

    return {
      ...grid,
      features: grid.features.map(feature =>
        smallTasks.has(feature)
          ? { ...feature, properties: { ...feature.properties, smallTask: true } }
          : feature,
      ),
    };
  });
  /** Convenience accessor: the task grid from the save API response (includes persisted IDs). */
  const savedTaskGrid = computed(() => savedTaskSummary.value?.taskGrid ?? null);
  const canGenerateTasks = computed(() =>
    Boolean(options.aoi.value)
    && options.projectId.value.trim().length > 0
    && taskPreviewSummary.value.totalTasks > 0
    && !generatingTasks.value
    && !savingTasks.value,
  );
  const canSaveTasks = computed(() =>
    Boolean(generatedTaskSummary.value)
    && !savedTaskSummary.value
    && taskCountToSave.value > 0
    && !generatingTasks.value
    && !savingTasks.value,
  );

  function updateTaskAreaSquareKilometers(value: number) {
    taskAreaSquareKilometers.value = normalizeTaskAreaSquareKilometers(value);
  }

  function resetTasking() {
    taskAreaSquareKilometers.value = PROJECT_WIZARD_TASK_AREA_DEFAULT;
    generatedTaskSummary.value = null;
    savedTaskSummary.value = null;
    discardSmallTasks.value = true;
  }

  async function generateTasks() {
    if (!options.aoi.value || !options.projectId.value.trim()) {
      return null;
    }

    generatingTasks.value = true;
    savedTaskSummary.value = null;

    try {
      const nextGeneratedSummary = await projectWizardClient.generateProjectTasks(
        options.workspaceId,
        options.projectId.value,
        options.aoi.value,
        currentTaskAreaSquareKilometers.value,
      );

      generatedTaskSummary.value = nextGeneratedSummary;
      discardSmallTasks.value = true;
      return nextGeneratedSummary;
    }
    finally {
      generatingTasks.value = false;
    }
  }

  async function saveTasks() {
    const taskGrid = taskGridToSave.value;

    if (!generatedTaskSummary.value || !taskGrid || !options.projectId.value.trim()) {
      return null;
    }

    savingTasks.value = true;

    try {
      const nextSavedSummary = await projectWizardClient.saveProjectTasks(
        options.workspaceId,
        options.projectId.value,
        taskGrid,
      );

      savedTaskSummary.value = nextSavedSummary;
      return nextSavedSummary;
    }
    finally {
      savingTasks.value = false;
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
        savedTaskSummary.value = null;
        return;
      }

      if (Math.abs(summary.requestedTaskAreaSquareKilometers - currentTaskAreaSquareKilometers.value) > Number.EPSILON) {
        generatedTaskSummary.value = null;
        savedTaskSummary.value = null;
      }
    },
  );

  watch(
    () => options.projectId.value,
    (projectId, previousProjectId) => {
      if (!projectId || projectId !== previousProjectId) {
        resetTasking();
      }
    },
    { immediate: true },
  );

  return {
    canGenerateTasks,
    canSaveTasks,
    currentTaskAreaSquareKilometers,
    discardSmallTasks,
    generateTasks,
    generatedTaskGrid,
    generatedTaskGridForDisplay,
    generatedTaskSummary,
    generatingTasks,
    resetTasking,
    saveTasks,
    savedTaskGrid,
    savedTaskSummary,
    savingTasks,
    smallTaskCount,
    taskCountToSave,
    taskGridToSave,
    taskPreviewGrid,
    taskPreviewSummary,
    updateTaskAreaSquareKilometers,
  };
}
