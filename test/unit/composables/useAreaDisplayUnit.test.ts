import { describe, expect, it } from 'vitest';
import { formatArea } from '~/composables/useAreaDisplayUnit';

describe('formatArea', () => {
  it('formats square kilometres with the proper superscript unit', () => {
    expect(formatArea(1, 'square_kilometers')).toBe('1 km²');
  });

  it('converts square kilometres to square miles for display', () => {
    expect(formatArea(1, 'square_miles')).toBe('0.39 mi²');
  });
});
