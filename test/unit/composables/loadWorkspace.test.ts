import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWorkspace } from '~/composables/loadWorkspace';
import { WorkspacesClientError } from '~/services/workspaces';

import type { WorkspacesClient } from '~/services/workspaces';

const getWorkspace = vi.hoisted(() => vi.fn());

vi.mock('~/services/index', () => ({
  workspacesClient: {
    getWorkspace,
  },
}));

const workspace = { id: 7, title: 'Seattle sidewalks' };

function apiError(status: number) {
  return new WorkspacesClientError(new Response(null, { status }));
}

describe('loadWorkspace', () => {
  beforeEach(() => {
    getWorkspace.mockReset();
  });

  it('returns the workspace the API sends', async () => {
    getWorkspace.mockResolvedValue(workspace);

    await expect(loadWorkspace(7)).resolves.toBe(workspace);
    expect(getWorkspace).toHaveBeenCalledWith(7);
  });

  it('turns the API\'s 404 into a fatal "Workspace not found" 404', async () => {
    getWorkspace.mockRejectedValue(apiError(404));

    await expect(loadWorkspace(7)).rejects.toMatchObject({
      status: 404,
      statusText: 'Workspace not found',
      message: 'This workspace does not exist or you do not have permission to access it.',
      fatal: true,
    });
  });

  it('passes any other failure through unchanged', async () => {
    const serverError = apiError(500);
    getWorkspace.mockRejectedValue(serverError);

    await expect(loadWorkspace(7)).rejects.toBe(serverError);
  });

  it.each([Number.NaN, 0, -1, 1.5])('treats id %s as not found without asking the API', async (id) => {
    await expect(loadWorkspace(id)).rejects.toMatchObject({
      status: 404,
      statusText: 'Workspace not found',
    });
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it('uses the client it is given', async () => {
    const client = { getWorkspace: vi.fn().mockResolvedValue(workspace) };

    await expect(loadWorkspace(7, client as unknown as WorkspacesClient)).resolves.toBe(workspace);
    expect(client.getWorkspace).toHaveBeenCalledWith(7);
    expect(getWorkspace).not.toHaveBeenCalled();
  });
});
