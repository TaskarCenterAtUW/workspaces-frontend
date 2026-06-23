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
    // Drawing and uploading are mutually exclusive entry points.
    // Starting a fresh draw clears any previously uploaded file + geometry so the map cannot
    // fall back to a stale AOI when the uploaded file is later removed.
    options.draft.area.aoi = null;
    options.draft.area.importedFileName = '';
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
      // Uploading a GeoJSON replaces any previously drawn/uploaded AOI entirely.
      // We clear first so the UI cannot retain an older polygon if parsing or later resets happen.
      options.draft.area.aoi = null;
      options.draft.area.importedFileName = '';
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

  function downloadAreaOfInterest() {
    if (!import.meta.client || !options.draft.area.aoi) {
      return;
    }

    const featureCollection = {
      type: 'FeatureCollection',
      features: [options.draft.area.aoi],
    };
    const blob = new Blob([`${JSON.stringify(featureCollection, null, 2)}\n`], {
      type: 'application/geo+json',
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = objectUrl;
    link.download = 'project-aoi.geojson';
    link.click();

    window.URL.revokeObjectURL(objectUrl);
  }

  return {
    areaImportError,
    areaWarningMessage,
    displayedAoi,
    downloadAreaOfInterest,
    importAreaOfInterest,
    isAreaDrawMode,
    isAreaStepActive,
    resetAreaOfInterest,
    startAreaDrawMode,
    updateAreaDrawMode,
    updateAreaFeature,
  };
}
