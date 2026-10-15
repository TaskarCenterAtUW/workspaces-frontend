import { describe, expect, it, vi } from 'vitest';
import { hasCreationRole } from '~/composables/useUserCapabilities';

vi.mock('~/services/index', () => ({
  tdeiUserClient: {
    getMyProjectGroups: vi.fn(),
  },
}));

describe('hasCreationRole', () => {
  it('returns true for poc role', () => {
    expect(hasCreationRole(['poc'])).toBe(true);
    expect(hasCreationRole(['member', 'poc'])).toBe(true);
  });

  it('returns true for tdei-admin role', () => {
    expect(hasCreationRole(['tdei-admin'])).toBe(true);
  });

  it('returns false for only member role', () => {
    expect(hasCreationRole(['member'])).toBe(false);
    expect(hasCreationRole([])).toBe(false);
  });

  it('handles general data generator roles when type is not specified', () => {
    expect(hasCreationRole(['osw_data_generator'])).toBe(true);
    expect(hasCreationRole(['pathways_data_generator'])).toBe(true);
  });

  it('checks specific data generator role when type is specified', () => {
    expect(hasCreationRole(['osw_data_generator'], 'osw')).toBe(true);
    expect(hasCreationRole(['pathways_data_generator'], 'osw')).toBe(false);
    expect(hasCreationRole(['poc'], 'osw')).toBe(true);
  });
});
