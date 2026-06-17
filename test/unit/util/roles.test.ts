import { describe, expect, it } from 'vitest';
import { ROLE_LABELS } from '~/util/roles';

describe('ROLE_LABELS', () => {
  it('maps each workspace role to a human label', () => {
    expect(ROLE_LABELS.lead).toBe('Owner');
    expect(ROLE_LABELS.validator).toBe('Validator');
    expect(ROLE_LABELS.contributor).toBe('Member');
  });
});
