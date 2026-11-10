import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authSessionState,
  cancelSessionReauthentication,
  SessionRecoveryCancelledError,
} from '~/services/auth-session';
import { TdeiAuthStore, TdeiClient, TdeiUserClient } from '~/services/tdei';
import { createGtfsArchive } from '~/util/gtfs';
import { server } from '../../mocks/server';

const TDEI_API_URL = 'http://api.test/tdei/';
const TDEI_USER_API_URL = 'http://api.test/tdei-user/';

function accessToken(subject = 'user-1'): string {
  return `header.${btoa(JSON.stringify({ sub: subject, name: 'Test User' }))}.signature`;
}

function authenticatedStore(options: { accessExpired?: boolean; refreshExpired?: boolean } = {}) {
  const auth = new TdeiAuthStore('tdei-auth-test');
  auth.username = 'test@example.com';
  auth.subject = 'user-1';
  auth.accessToken = accessToken();
  auth.refreshToken = 'refresh-token';
  auth.expiresAt = new Date(Date.now() + (options.accessExpired ? -60_000 : 60_000));
  auth.refreshExpiresAt = new Date(Date.now() + (options.refreshExpired ? -60_000 : 60_000));
  return auth;
}

afterEach(() => {
  localStorage.removeItem('tdei-auth-test');
  sessionStorage.clear();

  if (authSessionState.dialogOpen) {
    cancelSessionReauthentication();
  }
});

describe('TdeiClient session recovery', () => {
  it('shares one refresh when concurrent requests receive 401', async () => {
    const auth = authenticatedStore();
    const originalAccessToken = auth.accessToken;
    const client = new TdeiClient(TDEI_API_URL, auth);
    let refreshCalls = 0;
    let refreshBody: unknown;

    server.use(
      http.post(`${TDEI_API_URL}refresh-token`, async ({ request }) => {
        refreshCalls += 1;
        refreshBody = await request.json();
        return HttpResponse.json({
          access_token: accessToken('user-2'),
          refresh_token: 'new-refresh-token',
          expires_in: 3_600,
          refresh_expires_in: 7_200,
        });
      })
    );

    const send = vi.fn(async (token: string) =>
      token === originalAccessToken
        ? new Response(null, { status: 401 })
        : new Response(token)
    );
    const responses = await Promise.all([
      client.sendProtectedRequest(send),
      client.sendProtectedRequest(send),
      client.sendProtectedRequest(send),
    ]);

    expect(refreshCalls).toBe(1);
    expect(refreshBody).toEqual({ refreshToken: 'refresh-token' });
    expect(send).toHaveBeenCalledTimes(6);
    expect(await Promise.all(responses.map(response => response.text())))
      .toEqual([auth.accessToken, auth.accessToken, auth.accessToken]);
    client.logout();
  });

  it('opens session reauthentication when refreshing returns 401', async () => {
    const auth = authenticatedStore({ accessExpired: true });
    const client = new TdeiClient(TDEI_API_URL, auth);

    server.use(
      http.post(`${TDEI_API_URL}refresh-token`, () =>
        new HttpResponse(null, { status: 401, statusText: 'Unauthorized' })
      )
    );

    const request = client.sendProtectedRequest(async token => new Response(token));
    const rejection = expect(request).rejects.toBeInstanceOf(SessionRecoveryCancelledError);

    await vi.waitFor(() => expect(authSessionState.dialogOpen).toBe(true));
    cancelSessionReauthentication();

    await rejection;
    client.logout();
  });

  it('does not restore a session from a refresh that finishes after logout', async () => {
    const auth = authenticatedStore();
    const client = new TdeiClient(TDEI_API_URL, auth);
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let refreshStarted = false;

    server.use(
      http.post(`${TDEI_API_URL}refresh-token`, async () => {
        refreshStarted = true;
        await refreshGate;
        return HttpResponse.json({
          access_token: accessToken('user-2'),
          refresh_token: 'new-refresh-token',
          expires_in: 3_600,
          refresh_expires_in: 7_200,
        });
      })
    );

    const refresh = client.refreshToken();
    await vi.waitFor(() => expect(refreshStarted).toBe(true));
    client.logout();
    releaseRefresh();

    await expect(refresh).rejects.toBeInstanceOf(SessionRecoveryCancelledError);
    expect(auth.complete).toBe(false);
    expect(localStorage.getItem('tdei-auth-test')).toBeNull();
  });
});

describe('TdeiClient dataset-viewer feedback', () => {
  const feedback = (id: number) => ({
    id, status: 'open', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', due_date: '2026-11-01T00:00:00Z'
  });

  it('reads every page of feedback', async () => {
    const client = new TdeiClient(TDEI_API_URL, authenticatedStore());
    const pages: string[] = [];
    server.use(
      http.get(`${TDEI_API_URL}osw/dataset-viewer/feedbacks`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page_no')!;
        pages.push(page);
        const ids = page === '1' ? Array.from({ length: 50 }, (_, i) => i + 1) : [51, 52, 53];
        return HttpResponse.json(ids.map(feedback));
      })
    );

    const all = await client.getDatasetFeedback('dataset-1');

    expect(pages).toEqual(['1', '2']);
    expect(all.map(f => f.id)).toEqual(Array.from({ length: 53 }, (_, i) => i + 1));
    expect(all[0]!.created_at).toBeInstanceOf(Date);
    client.logout();
  });

  it('sends a feedback resolution to TDEI', async () => {
    const client = new TdeiClient(TDEI_API_URL, authenticatedStore());
    let url = '';
    let body: unknown;
    server.use(
      http.put(`${TDEI_API_URL}osw/dataset-viewer/feedbacks/:projectGroup/:dataset`, async ({ request }) => {
        url = request.url;
        body = await request.json();
        return HttpResponse.json([{ id: 7, message: 'Feedback status updated successfully.', status: 'Success' }]);
      })
    );

    await client.updateFeedbackStatus('pg-1', 'dataset-1', [{ id: 7, status: 'resolved', resolution_status: 'fixed', resolution_description: 'Kerb added' }]);

    expect(url).toBe(`${TDEI_API_URL}osw/dataset-viewer/feedbacks/pg-1/dataset-1`);
    expect(body).toEqual([{ id: 7, status: 'resolved', resolution_status: 'fixed', resolution_description: 'Kerb added' }]);
    client.logout();
  });

  it('throws when TDEI reports an item failed', async () => {
    const client = new TdeiClient(TDEI_API_URL, authenticatedStore());
    server.use(
      http.put(`${TDEI_API_URL}osw/dataset-viewer/feedbacks/:projectGroup/:dataset`, () =>
        HttpResponse.json([{ id: 7, message: 'Feedback record not found', status: 'Failed' }]))
    );

    await expect(client.updateFeedbackStatus('pg-1', 'dataset-1', [{ id: 7, status: 'resolved' }]))
      .rejects.toThrow('Feedback 7: Feedback record not found');
    client.logout();
  });
});

describe('TdeiClient.recoverSession', () => {
  it('refreshes the access token when it can', async () => {
    const auth = authenticatedStore();
    const client = new TdeiClient(TDEI_API_URL, auth);
    server.use(
      http.post(`${TDEI_API_URL}refresh-token`, () => HttpResponse.json({
        access_token: accessToken(),
        refresh_token: 'new-refresh-token',
        expires_in: 3_600,
        refresh_expires_in: 7_200
      }))
    );

    await client.recoverSession();

    expect(auth.refreshToken).toBe('new-refresh-token');
    expect(authSessionState.dialogOpen).toBe(false);
    client.logout();
  });

  it('asks the user to sign in again when the refresh is rejected', async () => {
    const auth = authenticatedStore();
    const client = new TdeiClient(TDEI_API_URL, auth);
    server.use(
      http.post(`${TDEI_API_URL}refresh-token`, () => new HttpResponse(null, { status: 401, statusText: 'Unauthorized' }))
    );

    const recovery = client.recoverSession();
    const rejection = expect(recovery).rejects.toBeInstanceOf(SessionRecoveryCancelledError);
    await vi.waitFor(() => expect(authSessionState.dialogOpen).toBe(true));
    cancelSessionReauthentication();

    await rejection;
    client.logout();
  });

  it('asks the user to sign in again when the refresh token has expired', async () => {
    const auth = authenticatedStore({ accessExpired: true, refreshExpired: true });
    const client = new TdeiClient(TDEI_API_URL, auth);

    const recovery = client.recoverSession();
    const rejection = expect(recovery).rejects.toBeInstanceOf(SessionRecoveryCancelledError);
    await vi.waitFor(() => expect(authSessionState.dialogOpen).toBe(true));
    cancelSessionReauthentication();

    await rejection;
    client.logout();
  });

  it('leaves other failures (e.g. offline) for a later retry, without asking to sign in', async () => {
    const auth = authenticatedStore();
    const client = new TdeiClient(TDEI_API_URL, auth);
    server.use(
      http.post(`${TDEI_API_URL}refresh-token`, () => HttpResponse.error())
    );

    await expect(client.recoverSession()).rejects.toBeTruthy();
    expect(authSessionState.dialogOpen).toBe(false);
    client.logout();
  });
});

describe('TdeiAuthStore persistence', () => {
  it('keeps a valid access token when only the refresh token has expired', () => {
    const storedAuth = authenticatedStore({ refreshExpired: true });
    storedAuth.store();

    const loadedAuth = new TdeiAuthStore('tdei-auth-test');

    expect(loadedAuth.ok).toBe(true);
    expect(loadedAuth.accessToken).toBe(storedAuth.accessToken);
    expect(loadedAuth.refreshTokenExpired).toBe(true);
  });

  it('clears malformed persisted authentication without breaking startup', () => {
    localStorage.setItem('tdei-auth-test', '{invalid-json');

    const auth = new TdeiAuthStore('tdei-auth-test');

    expect(auth.complete).toBe(false);
    expect(localStorage.getItem('tdei-auth-test')).toBeNull();
  });
});

describe('TdeiUserClient', () => {
  it('sends project-group requests through the protected request flow', async () => {
    const auth = authenticatedStore();
    const tdeiClient = new TdeiClient(TDEI_API_URL, auth);
    const client = new TdeiUserClient(TDEI_USER_API_URL, tdeiClient);
    let authorization = '';

    server.use(
      http.get(`${TDEI_USER_API_URL}project-group-roles/:subject`, ({ request }) => {
        authorization = request.headers.get('Authorization') ?? '';
        return HttpResponse.json([]);
      })
    );

    await client.getMyProjectGroups();

    expect(authorization).toBe(`Bearer ${auth.accessToken}`);
    tdeiClient.logout();
  });
});

describe('TdeiClient.getReferenceData', () => {
  it('fetches a TDEI API path with the user\'s sign-in', async () => {
    const client = new TdeiClient(TDEI_API_URL, authenticatedStore());
    let url = '';
    let authorization: string | null = null;
    server.use(
      http.get(`${TDEI_API_URL}job/download/4521`, ({ request }) => {
        url = request.url;
        authorization = request.headers.get('Authorization');
        return HttpResponse.json({ type: 'FeatureCollection', features: [] });
      })
    );

    const data = await client.getReferenceData('/api/v1/job/download/4521?file=beacon_hill/reference/platform.geojson');

    expect(data).toEqual({ type: 'FeatureCollection', features: [] });
    expect(url).toBe(`${TDEI_API_URL}job/download/4521?file=beacon_hill/reference/platform.geojson`);
    expect(authorization).toMatch(/^Bearer /);
    client.logout();
  });

  it('refuses anything but a TDEI API path, so the sign-in isn\'t sent elsewhere', async () => {
    const client = new TdeiClient(TDEI_API_URL, authenticatedStore());

    await expect(client.getReferenceData('https://example.com/drawing.geojson')).rejects.toThrow('Not a TDEI API path');
    await expect(client.getReferenceData('reference/platform.geojson')).rejects.toThrow('Not a TDEI API path');
    client.logout();
  });
});

describe('TdeiClient.getLevelReference', () => {
  const drawing = { type: 'FeatureCollection', features: [] };

  it('fetches a blob storage link as is, without the user\'s sign-in', async () => {
    const client = new TdeiClient(TDEI_API_URL, authenticatedStore());
    let authorization: string | null = 'unset';
    server.use(
      http.get('https://store.blob.core.windows.net/converter/4521/beacon_hill/reference/platform.geojson', ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json(drawing);
      })
    );

    expect(await client.getLevelReference('https://store.blob.core.windows.net/converter/4521/beacon_hill/reference/platform.geojson'))
      .toEqual(drawing);
    expect(authorization).toBeNull();
    client.logout();
  });

  it('reports a blob link that can\'t be loaded', async () => {
    const client = new TdeiClient(TDEI_API_URL, authenticatedStore());
    server.use(http.get('https://store.blob.core.windows.net/private.geojson', () =>
      new HttpResponse(null, { status: 409, statusText: 'Public access is not permitted' })));

    await expect(client.getLevelReference('https://store.blob.core.windows.net/private.geojson'))
      .rejects.toThrow('409 Public access is not permitted');
    client.logout();
  });

  it('reads the file from the job\'s zip while TDEI ignores ?file=', async () => {
    const client = new TdeiClient(TDEI_API_URL, authenticatedStore());
    const zip = await createGtfsArchive(new Map([
      ['beacon_hill/reference/platform.geojson', JSON.stringify(drawing)],
      ['beacon_hill/report.md', '# Beacon Hill']
    ]));
    server.use(http.get(`${TDEI_API_URL}job/download/4521`, async () =>
      new HttpResponse(await zip.arrayBuffer(), { headers: { 'Content-Type': 'application/zip' } })));

    expect(await client.getLevelReference('/api/v1/job/download/4521?file=beacon_hill/reference/platform.geojson'))
      .toEqual(drawing);
    await expect(client.getLevelReference('/api/v1/job/download/4521?file=beacon_hill/reference/roof.geojson'))
      .rejects.toThrow('don\'t include beacon_hill/reference/roof.geojson');
    client.logout();
  });
});
