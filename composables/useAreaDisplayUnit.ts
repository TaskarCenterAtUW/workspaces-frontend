export type AreaDisplayUnit = 'square_kilometers' | 'square_miles';

const AREA_UNIT_PREFERENCE_KEY = 'task-area-display-unit';
const SQUARE_MILES_PER_SQUARE_KILOMETER = 0.3861021585;

export const AREA_UNIT_OPTIONS: Array<{ label: string; value: AreaDisplayUnit }> = [
  { label: 'km²', value: 'square_kilometers' },
  { label: 'mi²', value: 'square_miles' },
];

export function formatArea(
  squareKilometers: number,
  displayUnit: AreaDisplayUnit,
): string {
  const convertedValue = displayUnit === 'square_miles'
    ? squareKilometers * SQUARE_MILES_PER_SQUARE_KILOMETER
    : squareKilometers;
  const formattedValue = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(convertedValue);

  return `${formattedValue} ${displayUnit === 'square_miles' ? 'mi²' : 'km²'}`;
}

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
    areaUnitOptions: AREA_UNIT_OPTIONS,
    selectAreaUnit,
  };
}

function isAreaDisplayUnit(value: string | null): value is AreaDisplayUnit {
  return value === 'square_kilometers' || value === 'square_miles';
}

function isUnitedStatesLocale(locale: string): boolean {
  try {
    return new Intl.Locale(locale).maximize().region === 'US';
  }
  catch {
    return false;
  }
}
