import { describe, expect, it } from 'vitest';
import { rapidSeverity, sameLevelSeverity } from '~/services/gtfs-severity';

describe('rapidSeverity', () => {
  it('shows problems that fail TDEI upload as labelled warnings, so work in progress still saves', () => {
    expect(rapidSeverity('ERROR', 'This station has no entrances'))
      .toEqual({ severity: 'warning', message: 'Fails TDEI upload: This station has no entrances' });
  });

  it('shows warnings as warnings and info as suggestions', () => {
    expect(rapidSeverity('WARNING', 'm')).toEqual({ severity: 'warning', message: 'm' });
    expect(rapidSeverity('INFO', 'm')).toEqual({ severity: 'suggestion', message: 'm' });
  });
});

describe('sameLevelSeverity', () => {
  it('fails escalators and elevators on one level, but only warns about stairs', () => {
    expect(sameLevelSeverity('4')).toBe('ERROR');
    expect(sameLevelSeverity('5')).toBe('ERROR');
    expect(sameLevelSeverity('2')).toBe('WARNING');
  });
});
