import {
  isAreaDisplayUnit,
  isUnitedStatesLocale,
  type AreaDisplayUnit,
} from '~/util/area';

const AREA_UNIT_PREFERENCE_KEY = 'task-area-display-unit';

export function useAreaDisplayUnit() {
  const areaUnit = ref<AreaDisplayUnit>('square_kilometers');

  onMounted(() => {
    let savedAreaUnit: string | null = null;

    try {
      savedAreaUnit = window.localStorage.getItem(AREA_UNIT_PREFERENCE_KEY);
    }
    catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }

    if (isAreaDisplayUnit(savedAreaUnit)) {
      areaUnit.value = savedAreaUnit;
      return;
    }

    if (isUnitedStatesLocale(window.navigator.language)) {
      areaUnit.value = 'square_miles';
    }
  });

  function selectAreaUnit(nextUnit: AreaDisplayUnit) {
    areaUnit.value = nextUnit;

    try {
      window.localStorage.setItem(AREA_UNIT_PREFERENCE_KEY, nextUnit);
    }
    catch {
      // The in-memory preference still applies for the current page.
    }
  }

  return {
    areaUnit,
    selectAreaUnit,
  };
}
