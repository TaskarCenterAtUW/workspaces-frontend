import { beforeEach, describe, expect, it } from 'vitest';
import {
  getWorkspacePinsStorageKey,
  keepOnePinPerProjectGroup,
  readWorkspacePins,
  removeUnavailableWorkspacePins,
  writeWorkspacePins,
} from '~/util/workspace-pins';

describe('workspace pin persistence', () => {
  const userId = 'user-123';

  beforeEach(() => {
    localStorage.removeItem(getWorkspacePinsStorageKey(userId));
  });

  it('uses a user-scoped storage key', () => {
    expect(getWorkspacePinsStorageKey(userId)).toBe('tdei-pinned-workspaces:user-123');
  });

  it('round-trips unique workspace IDs', () => {
    writeWorkspacePins(localStorage, userId, [2, 1, 2]);

    expect(readWorkspacePins(localStorage, userId)).toEqual([2, 1]);
  });

  it('ignores malformed stored values', () => {
    localStorage.setItem(getWorkspacePinsStorageKey(userId), JSON.stringify([1, '2', -3, 1]));

    expect(readWorkspacePins(localStorage, userId)).toEqual([1]);

    localStorage.setItem(getWorkspacePinsStorageKey(userId), '{invalid json');
    expect(readWorkspacePins(localStorage, userId)).toEqual([]);
  });

  it('removes workspaces that are no longer available', () => {
    expect(removeUnavailableWorkspacePins([1, 2, 3], [1, 3, 4])).toEqual([1, 3]);
  });

  it('keeps one available pin in each project group', () => {
    expect(keepOnePinPerProjectGroup([1, 2, 3, 4], [
      { id: 1, tdeiProjectGroupId: 'group-a' },
      { id: 2, tdeiProjectGroupId: 'group-a' },
      { id: 3, tdeiProjectGroupId: 'group-b' }
    ])).toEqual([1, 3]);
  });
});
