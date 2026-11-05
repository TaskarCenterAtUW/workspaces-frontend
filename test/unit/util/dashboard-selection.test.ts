import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDashboardSelectionStorageKey,
  readDashboardSelection,
  resolveProjectGroupId,
  writeDashboardSelection,
} from '~/util/dashboard-selection';

describe('dashboard selection persistence', () => {
  const userId = 'user-123';

  beforeEach(() => {
    localStorage.removeItem(getDashboardSelectionStorageKey(userId));
  });

  it('uses a user-scoped storage key', () => {
    expect(getDashboardSelectionStorageKey(userId)).toBe('tdei-dashboard-selection:user-123');
  });

  it('round-trips the selected project group and per-group workspaces', () => {
    writeDashboardSelection(localStorage, userId, {
      projectGroupId: 'pg-2',
      workspaceByProjectGroup: { 'pg-1': 10, 'pg-2': 20 },
    });

    expect(readDashboardSelection(localStorage, userId)).toEqual({
      projectGroupId: 'pg-2',
      workspaceByProjectGroup: { 'pg-1': 10, 'pg-2': 20 },
    });
  });

  it('ignores malformed stored values', () => {
    localStorage.setItem(getDashboardSelectionStorageKey(userId), JSON.stringify({
      projectGroupId: '',
      workspaceByProjectGroup: { 'pg-1': 10, 'pg-2': 'bad', 'pg-3': -5 },
    }));

    expect(readDashboardSelection(localStorage, userId)).toEqual({
      projectGroupId: null,
      workspaceByProjectGroup: { 'pg-1': 10 },
    });

    localStorage.setItem(getDashboardSelectionStorageKey(userId), '{invalid json');
    expect(readDashboardSelection(localStorage, userId)).toEqual({
      projectGroupId: null,
      workspaceByProjectGroup: {},
    });
  });

  it('resolves the remembered project group if available or falls back to the first', () => {
    expect(resolveProjectGroupId('pg-2', ['pg-1', 'pg-2'])).toBe('pg-2');
    expect(resolveProjectGroupId('pg-missing', ['pg-1', 'pg-2'])).toBe('pg-1');
    expect(resolveProjectGroupId(null, ['pg-1', 'pg-2'])).toBe('pg-1');
    expect(resolveProjectGroupId('pg-1', [])).toBeNull();
  });

  it('returns an empty selection when storage.getItem throws', () => {
    const throwingGetStorage = {
      getItem: () => {
        throw new Error('Storage access blocked');
      },
    } as unknown as Storage;

    expect(readDashboardSelection(throwingGetStorage, userId)).toEqual({
      projectGroupId: null,
      workspaceByProjectGroup: {},
    });
  });

  it('does not throw when storage.setItem fails', () => {
    const throwingSetStorage = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;

    expect(() => writeDashboardSelection(throwingSetStorage, userId, {
      projectGroupId: 'pg-1',
      workspaceByProjectGroup: { 'pg-1': 1 },
    })).not.toThrow();
  });
});
