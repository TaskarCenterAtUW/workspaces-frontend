import {
  calculateProjectWizardAoiAreaSquareKilometers,
  parseProjectWizardAoiFileContent,
} from '~/services/project-wizard-aoi';

import type { ComputedRef, Ref } from 'vue';
import type {
  ProjectWizardAreaFeature,
  ProjectWizardAreaStepDefinition,
  ProjectWizardDraft,
  ProjectWizardStepId,
} from '~/types/project-wizard';

interface UseProjectWizardAoiOptions {
  areaStep: ComputedRef<ProjectWizardAreaStepDefinition | undefined>;
  currentStep: Ref<ProjectWizardStepId>;
  draft: ProjectWizardDraft;
}

export function useProjectWizardAoi(options: UseProjectWizardAoiOptions) {
  const areaImportError = ref('');
  const isAreaDrawMode = ref(false);

  const isAreaStepActive = computed(() => options.currentStep.value === 'area');
  const displayedAoi = computed(() => options.draft.area.aoi);
  const areaWarningMessage = computed(() => {
    if (!options.areaStep.value || !options.draft.area.aoi) {
      return '';
    }

    const threshold = options.areaStep.value.content.uploadWarningThresholdSquareKilometers;
    const areaSquareKilometers = calculateProjectWizardAoiAreaSquareKilometers(options.draft.area.aoi);

    return areaSquareKilometers > threshold
      ? options.areaStep.value.content.uploadWarningText
      : '';
  });

  watch(
    () => options.currentStep.value,
    (step) => {
      if (step !== 'area') {
        isAreaDrawMode.value = false;
        areaImportError.value = '';
      }
    },
  );

  function updateAreaFeature(feature: ProjectWizardAreaFeature | null) {
    options.draft.area.aoi = feature;
    options.draft.area.importedFileName = '';
    areaImportError.value = '';
  }

  function updateAreaDrawMode(value: boolean) {
    isAreaDrawMode.value = value;
  }

  function startAreaDrawMode() {
    areaImportError.value = '';
    isAreaDrawMode.value = true;
  }

  function resetAreaOfInterest() {
    options.draft.area.aoi = null;
    options.draft.area.importedFileName = '';
    areaImportError.value = '';
    isAreaDrawMode.value = false;
  }

  async function importAreaOfInterest(file: File) {
    try {
      const fileContent = await file.text();
      const { feature } = parseProjectWizardAoiFileContent(fileContent);

      options.draft.area.aoi = feature;
      options.draft.area.importedFileName = file.name;
      areaImportError.value = '';
      isAreaDrawMode.value = false;
    }
    catch (error) {
      areaImportError.value = error instanceof Error
        ? error.message
        : 'Unable to import the AOI file.';
    }
  }

  return {
    areaImportError,
    areaWarningMessage,
    displayedAoi,
    importAreaOfInterest,
    isAreaDrawMode,
    isAreaStepActive,
    resetAreaOfInterest,
    startAreaDrawMode,
    updateAreaDrawMode,
    updateAreaFeature,
  };
}
