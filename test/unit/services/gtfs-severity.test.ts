import { describe, expect, it } from 'vitest';
import { isPathwayStop, rapidSeverity, TDEI_STRICT } from '~/services/gtfs-severity';

describe('rapidSeverity', () => {
  it('shows errors outside pathways data, which fail TDEI upload, as labelled warnings, so work in progress still saves', () => {
    expect(rapidSeverity('ERROR', 'This station needs a stop_name', false))
      .toEqual({ severity: 'warning', message: 'Fails TDEI upload: This station needs a stop_name' });
  });

  it('shows errors in pathways data as plain warnings while TDEI is lenient', () => {
    expect(TDEI_STRICT).toBe(false);
    expect(rapidSeverity('ERROR', 'This station has no entrances')).toEqual({ severity: 'warning', message: 'This station has no entrances' });
  });

  it('shows warnings as warnings and info as suggestions', () => {
    expect(rapidSeverity('WARNING', 'm')).toEqual({ severity: 'warning', message: 'm' });
    expect(rapidSeverity('INFO', 'm')).toEqual({ severity: 'suggestion', message: 'm' });
  });
});

describe('isPathwayStop', () => {
  it('counts entrances, generic nodes and boarding areas as pathways data, not platforms or stations', () => {
    expect(['2', '3', '4'].map(type => isPathwayStop({ tags: { location_type: type } }))).toEqual([true, true, true]);
    expect(['', '0', '1'].map(type => isPathwayStop({ tags: { location_type: type } }))).toEqual([false, false, false]);
  });
});
