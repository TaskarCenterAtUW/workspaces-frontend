import { describe, expect, it } from 'vitest';
import {
  formatArea,
  isAreaDisplayUnit,
  isUnitedStatesLocale,
} from '~/util/area';

describe('area utilities', () => {
  it('formats square kilometres with the proper superscript unit', () => {
    expect(formatArea(1, 'square_kilometers')).toBe('1 km²');
  });

  it('converts square kilometres to square miles for display', () => {
    expect(formatArea(1, 'square_miles')).toBe('0.39 mi²');
  });

  it('validates supported display units', () => {
    expect(isAreaDisplayUnit('square_miles')).toBe(true);
    expect(isAreaDisplayUnit('acres')).toBe(false);
  });

  it('detects United States locales without throwing for invalid locales', () => {
    expect(isUnitedStatesLocale('en-US')).toBe(true);
    expect(isUnitedStatesLocale('en-GB')).toBe(false);
    expect(isUnitedStatesLocale('not_a_locale')).toBe(false);
  });
});
