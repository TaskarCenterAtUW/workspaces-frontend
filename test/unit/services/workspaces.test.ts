import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { WorkspacesClient, WorkspacesClientError } from '~/services/workspaces';
import { server } from '../../mocks/server';
import { TEST_API_BASE } from '../../mocks/fixtures';

import type { OsmApiClient } from '~/services/osm';
import type { TdeiClient } from '~/services/tdei';

// getMyWorkspaces only touches the new-API HTTP client, so the osm collaborator
// can be inert. The tdei stub just needs the bits WorkspacesClient._send uses:
// a no-op auth refresh and an `auth` object whose `complete` flag gates the
// Authorization header. The real BaseHttpClient runs end to end — MSW
// intercepts at fetch, so URL building and error mapping are exercised.
const tdeiClient = {
  tryRefreshAuth: async () => {},
  auth: { complete: false, accessToken: '' }
} as unknown as TdeiClient;
const osmClient = {} as unknown as OsmApiClient;

function makeClient() {
  return new WorkspacesClient(TEST_API_BASE, TEST_API_BASE, tdeiClient, osmClient);
}

describe('WorkspacesClient.getMyWorkspaces', () => {
  it('returns the workspaces and hydrates createdAt into a Date', async () => {
    const workspaces = await makeClient().getMyWorkspaces();

    expect(workspaces).toHaveLength(2);
    expect(workspaces[0]!.id).toBe(1);
    expect(workspaces[0]!.title).toBe('Seattle Sidewalks');
    expect(workspaces[0]!.createdAt).toBeInstanceOf(Date);
    expect(workspaces[0]!.createdAt.toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('throws a WorkspacesClientError on a non-2xx response', async () => {
    // Per-test override: make the endpoint fail. Reset automatically afterEach.
    server.use(
      http.get(`${TEST_API_BASE}workspaces/mine`, () => {
        return new HttpResponse(null, { status: 500, statusText: 'Server Error' });
      })
    );

    await expect(makeClient().getMyWorkspaces()).rejects.toBeInstanceOf(WorkspacesClientError);
  });
});
