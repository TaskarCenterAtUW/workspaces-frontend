export type AreaDisplayUnit = 'square_kilometers' | 'square_miles';

const SQUARE_MILES_PER_SQUARE_KILOMETER = 0.3861021585;

export const AREA_UNIT_OPTIONS: ReadonlyArray<{
  label: string;
  value: AreaDisplayUnit;
}> = [
  { label: 'km²', value: 'square_kilometers' },
  { label: 'mi²', value: 'square_miles' },
];

/**
 * Format an area in the requested unit. By default, values are rounded to two decimal places.
 * Callers can pass number-format options when they need to preserve very small values.
 */
export function formatArea(
  squareKilometers: number,
  displayUnit: AreaDisplayUnit,
  numberFormatOptions: Intl.NumberFormatOptions = { maximumFractionDigits: 2, minimumFractionDigits: 0 },
): string {
  const convertedValue = displayUnit === 'square_miles'
    ? squareKilometers * SQUARE_MILES_PER_SQUARE_KILOMETER
    : squareKilometers;
  const formattedValue = new Intl.NumberFormat(undefined, numberFormatOptions).format(convertedValue);

  return `${formattedValue} ${displayUnit === 'square_miles' ? 'mi²' : 'km²'}`;
}

export function isAreaDisplayUnit(value: string | null): value is AreaDisplayUnit {
  return value === 'square_kilometers' || value === 'square_miles';
}

export function isUnitedStatesLocale(locale: string): boolean {
  try {
    return new Intl.Locale(locale).maximize().region === 'US';
  }
  catch {
    return false;
  }
}
