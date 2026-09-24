import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authSessionState,
  cancelSessionReauthentication,
  SessionRecoveryCancelledError,
} from '~/services/auth-session';
import { TdeiAuthStore, TdeiClient, TdeiUserClient } from '~/services/tdei';
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
