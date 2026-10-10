import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { OsmApiClientError } from '~/services/osm';
import { WorkspacesClient, WorkspacesClientError } from '~/services/workspaces';
import { server } from '../../mocks/server';
import { TEST_API_BASE } from '../../mocks/fixtures';

import type { OsmApiClient } from '~/services/osm';
import type { TdeiClient } from '~/services/tdei';

// Creating, provisioning and deleting a workspace. The tdei stub runs
// protected requests with a test token, and MSW intercepts at fetch, so the
// real HTTP client runs end to end.
const tdeiClient = {
  sendProtectedRequest: async (
    request: (accessToken: string) => Promise<Response>
  ) => await request('test-access-token'),
  auth: { complete: false, accessToken: '' }
} as unknown as TdeiClient;
const osmClient = {} as unknown as OsmApiClient;

describe('WorkspacesClient.createWorkspace', () => {
  const workspace = {
    title: 'New workspace',
    type: 'osw' as const,
    tdeiProjectGroupId: '11111111-1111-4111-8111-111111111111'
  };

  function makeClient() {
    return new WorkspacesClient(TEST_API_BASE, TEST_API_BASE, tdeiClient, osmClient);
  }

  it('returns the workspaceId the API responds with', async () => {
    server.use(
      http.post(`${TEST_API_BASE}workspaces`, () => HttpResponse.json({ workspaceId: 77 }, { status: 201 }))
    );

    await expect(makeClient().createWorkspace({ ...workspace })).resolves.toBe(77);
  });

  it.each([
    ['a missing id', { }],
    ['a non-integer id', { workspaceId: 1.5 }],
    ['a string id', { workspaceId: '77' }],
    ['a null body', null]
  ])('rejects %s rather than returning it', async (_label, body) => {
    // A failed merge commit rolls back by deleting the returned ID, so an
    // unchecked value here would aim a delete at whatever came back.
    server.use(
      http.post(`${TEST_API_BASE}workspaces`, () => HttpResponse.json(body))
    );

    await expect(makeClient().createWorkspace({ ...workspace }))
      .rejects.toThrow(/valid integer workspace ID/);
  });
});

describe('WorkspacesClient.createBlankWorkspace', () => {
  function makeBlankClient(osm: unknown) {
    return new WorkspacesClient(TEST_API_BASE, TEST_API_BASE, tdeiClient, osm as OsmApiClient);
  }

  function blankWorkspace(type: 'osw' | 'pathways') {
    return {
      title: 'Empty workspace',
      type,
      tdeiProjectGroupId: '11111111-1111-1111-1111-111111111111'
    };
  }

  it.each(['osw', 'pathways'] as const)(
    'provisions an empty OSM store for a blank %s workspace',
    async (type) => {
      const createOsmWorkspace = vi.fn().mockResolvedValue(undefined);
      const client = makeBlankClient({ createWorkspace: createOsmWorkspace });

      server.use(
        http.post(`${TEST_API_BASE}workspaces`, () => {
          expect(createOsmWorkspace).not.toHaveBeenCalled();
          return HttpResponse.json({ workspaceId: 1909 }, { status: 201 });
        })
      );

      await expect(client.createBlankWorkspace(blankWorkspace(type))).resolves.toBe(1909);
      expect(createOsmWorkspace).toHaveBeenCalledOnce();
      expect(createOsmWorkspace).toHaveBeenCalledWith(1909);
    }
  );

  it('does not provision OSM when workspace record creation fails', async () => {
    const createOsmWorkspace = vi.fn().mockResolvedValue(undefined);
    const client = makeBlankClient({ createWorkspace: createOsmWorkspace });

    server.use(
      http.post(`${TEST_API_BASE}workspaces`, () =>
        new HttpResponse(null, { status: 500, statusText: 'Server Error' }))
    );

    await expect(client.createBlankWorkspace(blankWorkspace('pathways')))
      .rejects.toBeInstanceOf(WorkspacesClientError);

    expect(createOsmWorkspace).not.toHaveBeenCalled();
  });

  it('deletes the workspace row when OSM provisioning fails', async () => {
    // Left behind, the row sits on the dashboard with no OSM database behind
    // it, and every retry adds another.
    const deleteOsmWorkspace = vi.fn().mockResolvedValue(undefined);
    const client = makeBlankClient({
      createWorkspace: vi.fn().mockRejectedValue(new Error('osm provisioning failed')),
      deleteWorkspace: deleteOsmWorkspace
    });

    let deletedPath: string | undefined;

    server.use(
      http.post(`${TEST_API_BASE}workspaces`, () =>
        HttpResponse.json({ workspaceId: 1909 }, { status: 201 })),
      http.delete(`${TEST_API_BASE}workspaces/1909`, ({ request }) => {
        deletedPath = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      })
    );

    await expect(client.createBlankWorkspace(blankWorkspace('osw')))
      .rejects.toThrow('osm provisioning failed');

    expect(deletedPath).toBe('/workspaces/1909');
    expect(deleteOsmWorkspace).toHaveBeenCalledWith(1909);
  });

  it('still deletes the row when the database delete fails', async () => {
    // Provisioning may have failed before creating the database, and then
    // there is nothing for the database delete to remove.
    const client = makeBlankClient({
      createWorkspace: vi.fn().mockRejectedValue(new Error('osm provisioning failed')),
      deleteWorkspace: vi.fn().mockRejectedValue(osmError(500))
    });

    let rowDeleted = false;

    server.use(
      http.post(`${TEST_API_BASE}workspaces`, () =>
        HttpResponse.json({ workspaceId: 1909 }, { status: 201 })),
      http.delete(`${TEST_API_BASE}workspaces/1909`, () => {
        rowDeleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    await expect(client.createBlankWorkspace(blankWorkspace('osw')))
      .rejects.toThrow('osm provisioning failed');

    expect(rowDeleted).toBe(true);
  });

  it('reports the provisioning failure even when the rollback also fails', async () => {
    // The drop fails in a way that still sends the row delete, so both halves
    // of the rollback fail here.
    const client = makeBlankClient({
      createWorkspace: vi.fn().mockRejectedValue(new Error('osm provisioning failed')),
      deleteWorkspace: vi.fn().mockRejectedValue(osmError(500))
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    server.use(
      http.post(`${TEST_API_BASE}workspaces`, () =>
        HttpResponse.json({ workspaceId: 1909 }, { status: 201 })),
      http.delete(`${TEST_API_BASE}workspaces/1909`, () =>
        new HttpResponse(null, { status: 500, statusText: 'Server Error' }))
    );

    // Restored in `finally`: a failed assertion would otherwise leave the
    // warning silenced for every later test in this file.
    try {
      await expect(client.createBlankWorkspace(blankWorkspace('osw')))
        .rejects.toThrow('osm provisioning failed');

      // Left unlogged, the unusable workspace it leaves behind would have no trace.
      expect(warn).toHaveBeenCalledWith('Rollback of workspace 1909 failed.', expect.any(WorkspacesClientError));
    }
    finally {
      warn.mockRestore();
    }
  });
});

function osmError(status: number): OsmApiClientError {
  return new OsmApiClientError(new Response(null, { status }));
}

describe('WorkspacesClient.deleteWorkspace', () => {
  function makeDeleteClient(osm: unknown) {
    return new WorkspacesClient(TEST_API_BASE, TEST_API_BASE, tdeiClient, osm as OsmApiClient);
  }

  function recordRowDelete(calls: string[]) {
    server.use(
      http.delete(`${TEST_API_BASE}workspaces/7`, () => {
        calls.push('row');
        return new HttpResponse(null, { status: 204 });
      })
    );
  }

  it('drops the database before deleting the row', async () => {
    // The drop resolves late, so a row delete sent alongside it rather than
    // after it would be recorded first:
    const calls: string[] = [];
    const client = makeDeleteClient({
      deleteWorkspace: vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        calls.push('database');
      })
    });

    recordRowDelete(calls);
    await client.deleteWorkspace(7);

    expect(calls).toEqual(['database', 'row']);
  });

  it.each([401, 403])('keeps the row when the database drop is refused with %i', async (status) => {
    const calls: string[] = [];
    const client = makeDeleteClient({
      deleteWorkspace: vi.fn().mockRejectedValue(osmError(status))
    });

    recordRowDelete(calls);

    await expect(client.deleteWorkspace(7)).rejects.toBeInstanceOf(OsmApiClientError);
    expect(calls).toEqual([]);
  });

  it('keeps the row when the database drop fails without a response', async () => {
    const calls: string[] = [];
    const client = makeDeleteClient({
      deleteWorkspace: vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    });

    recordRowDelete(calls);

    await expect(client.deleteWorkspace(7)).rejects.toThrow('Failed to fetch');
    expect(calls).toEqual([]);
  });

  it('deletes the row when the workspace has no database to drop', async () => {
    // The OSM API answers a drop for a database that does not exist with a
    // server error. Stopping there would make the row impossible to delete.
    const calls: string[] = [];
    const client = makeDeleteClient({
      deleteWorkspace: vi.fn().mockRejectedValue(osmError(500))
    });

    recordRowDelete(calls);
    await client.deleteWorkspace(7);

    expect(calls).toEqual(['row']);
  });
});
