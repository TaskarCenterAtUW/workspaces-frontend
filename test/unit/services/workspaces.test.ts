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
  it('returns the workspaces and hydrates workspace timestamps into Dates', async () => {
    const workspaces = await makeClient().getMyWorkspaces();

    expect(workspaces).toHaveLength(2);
    expect(workspaces[0]!.id).toBe(1);
    expect(workspaces[0]!.title).toBe('Seattle Sidewalks');
    expect(workspaces[0]!.importStatus).toBe('completed');
    expect(workspaces[0]!.createdAt).toBeInstanceOf(Date);
    expect(workspaces[0]!.createdAt.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    expect(workspaces[0]!.updatedAt).toBeInstanceOf(Date);
    expect(workspaces[0]!.updatedAt!.toISOString()).toBe('2026-02-18T05:10:00.583Z');
  });

  it('falls back to createdAt when an older response omits updatedAt', async () => {
    server.use(
      http.get(`${TEST_API_BASE}workspaces/mine`, () => HttpResponse.json([{
        id: 1,
        title: 'W',
        createdAt: '2026-01-15T12:00:00.000Z'
      }]))
    );

    const [workspace] = await makeClient().getMyWorkspaces();

    expect(workspace!.updatedAt).toEqual(workspace!.createdAt);
  });

  // Regression: the API sends `tdeiMetadata` inconsistently — sometimes a
  // JSON-encoded string, sometimes an already-parsed object. Blindly calling
  // JSON.parse() on the object form coerces it to "[object Object]" and throws
  // `SyntaxError: "[object Object]" is not valid JSON`, which used to blow up
  // the dashboard's <script setup>. Normalize must tolerate every form.
  it.each([
    ['a JSON-encoded string', '{"metadata":{"foo":"bar"}}', { metadata: { foo: 'bar' } }],
    ['an already-parsed object', { metadata: { foo: 'bar' } }, { metadata: { foo: 'bar' } }],
    ['null', null, {}],
    ['an empty string', '', {}],
    ['a malformed JSON string', '{not json', {}]
  ])('parses tdeiMetadata when the API returns %s', async (_label, raw, expected) => {
    server.use(
      http.get(`${TEST_API_BASE}workspaces/mine`, () => {
        return HttpResponse.json([{ id: 1, title: 'W', createdAt: '2026-01-15T12:00:00.000Z', tdeiMetadata: raw }]);
      })
    );

    const [workspace] = await makeClient().getMyWorkspaces();

    expect(workspace!.tdeiMetadata).toEqual(expected);
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

describe('WorkspacesClient.getWorkspaceBbox', () => {
  // Use a DISTINCT new-API base so the test proves the call base-swaps onto the
  // v1 (tasking) API — if it used the legacy base, the new-API stub wouldn't
  // match and the fetch would fail.
  const NEW_API_BASE = 'http://new-api.test/';

  function makeBboxClient() {
    return new WorkspacesClient(TEST_API_BASE, NEW_API_BASE, tdeiClient, osmClient);
  }

  it('fetches the bbox from the v1 endpoint and returns it unchanged (backend sends decimal degrees)', async () => {
    // Regression: coordinates come pre-scaled from the backend, so the client
    // must NOT re-scale them — bbox in === bbox out.
    const bbox = { min_lat: 47.6, min_lon: -122.34, max_lat: 47.62, max_lon: -122.32 };
    server.use(
      http.get(`${NEW_API_BASE}workspaces/1/bbox`, () => HttpResponse.json(bbox))
    );

    await expect(makeBboxClient().getWorkspaceBbox(1)).resolves.toEqual(bbox);
  });

  it('returns undefined when the workspace has no extent (204)', async () => {
    server.use(
      http.get(`${NEW_API_BASE}workspaces/1/bbox`, () => new HttpResponse(null, { status: 204 }))
    );

    await expect(makeBboxClient().getWorkspaceBbox(1)).resolves.toBeUndefined();
  });
});

describe('WorkspacesClient.getWorkspaceJobs', () => {
  it('returns workspace jobs from the jobs endpoint in API order', async () => {
    const jobs = [{
      id: 2,
      workspace_id: 1769,
      job_type: 'workspace-import',
      request: {},
      current_task: 'Create Changeset',
      response: {
        message: 'Create Changeset step failed',
        success: false,
        messageCode: 'STEP_EXECUTION_FAILED'
      },
      created_at: '2026-08-14T05:44:15.816029',
      updated_at: '2026-08-14T10:02:42.972197',
      status: 'completed',
      current_task_status: null
    }];
    server.use(
      http.get(`${TEST_API_BASE}workspaces/1769/jobs`, () => HttpResponse.json(jobs))
    );

    await expect(makeClient().getWorkspaceJobs(1769)).resolves.toEqual(jobs);
  });
});

describe('WorkspacesClient.createWorkspaceFromFile', () => {
  const LEGACY_API_BASE = 'http://legacy-api.test/';
  const NEW_API_BASE = 'http://new-api.test/';

  it('posts multipart data to the new API without changing the shared legacy base', async () => {
    let legacyUploadCalled = false;
    let receivedBody: FormData | undefined;

    server.use(
      http.post(`${LEGACY_API_BASE}workspaces/from-file`, () => {
        legacyUploadCalled = true;
        return HttpResponse.json({ id: 999 });
      }),
      http.post(`${NEW_API_BASE}workspaces/from-file`, async ({ request }) => {
        receivedBody = await request.formData();
        return HttpResponse.json({ id: 456 }, { status: 201 });
      }),
      http.get(`${LEGACY_API_BASE}workspaces/mine`, () => HttpResponse.json([]))
    );

    const client = new WorkspacesClient(
      LEGACY_API_BASE,
      NEW_API_BASE,
      tdeiClient,
      osmClient
    );
    const workspaceId = await client.createWorkspaceFromFile(
      new Blob(['dataset']),
      {
        title: 'Uploaded workspace',
        type: 'pathways',
        tdeiProjectGroupId: '11111111-1111-4111-8111-111111111111'
      }
    );

    expect(workspaceId).toBe(456);
    expect(legacyUploadCalled).toBe(false);
    expect(receivedBody?.get('title')).toBe('Uploaded workspace');
    expect(receivedBody?.get('type')).toBe('pathways');
    await expect(client.getMyWorkspaces()).resolves.toEqual([]);
  });
});
