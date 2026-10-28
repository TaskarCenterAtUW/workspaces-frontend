import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearWorkspaceMetadata, loadWorkspaceMetadata } from '~/services/workspace-metadata';

const getWorkspace = vi.hoisted(() => vi.fn());

vi.mock('~/services/index', () => ({
  workspacesClient: {
    getWorkspace,
  },
}));

describe('loadWorkspaceMetadata', () => {
  beforeEach(() => {
    getWorkspace.mockReset();
    clearWorkspaceMetadata();
  });

  it('returns the metadata from the single-workspace GET', async () => {
    getWorkspace.mockResolvedValue({ id: 1, tdeiMetadata: { metadata: { a: 1 } } });

    await expect(loadWorkspaceMetadata(1)).resolves.toEqual({ metadata: { a: 1 } });
    expect(getWorkspace).toHaveBeenCalledWith(1);
  });

  it('makes one request per workspace, shared by concurrent callers', async () => {
    getWorkspace.mockResolvedValue({ id: 1, tdeiMetadata: null });

    await Promise.all([loadWorkspaceMetadata(1), loadWorkspaceMetadata(1)]);
    await loadWorkspaceMetadata(1);

    expect(getWorkspace).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure, so the next call retries', async () => {
    getWorkspace
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce({ id: 1, tdeiMetadata: 'ok' });

    await expect(loadWorkspaceMetadata(1)).rejects.toThrow('502');
    await expect(loadWorkspaceMetadata(1)).resolves.toBe('ok');
  });

  it('fetches again after the cache is cleared', async () => {
    getWorkspace.mockResolvedValue({ id: 1, tdeiMetadata: null });

    await loadWorkspaceMetadata(1);
    clearWorkspaceMetadata();
    await loadWorkspaceMetadata(1);

    expect(getWorkspace).toHaveBeenCalledTimes(2);
  });
});
