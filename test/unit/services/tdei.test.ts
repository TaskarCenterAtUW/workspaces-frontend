import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TdeiAuthStore, TdeiClient } from '~/services/tdei';

function jwt(payload: Record<string, unknown>) {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

  return `${encode({ alg: 'none' })}.${encode(payload)}.`;
}

describe('TdeiClient auth handoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('exchanges an external refresh token and stores the rotated session', async () => {
    const accessToken = jwt({
      sub: 'user-1',
      name: 'TDEI User',
      email: 'user@example.com',
      preferred_username: 'tdei-user',
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: 'rotated-refresh-token',
        expires_in: 300,
        refresh_expires_in: 3600,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const auth = new TdeiAuthStore('handoff-test-auth');
    const client = new TdeiClient('https://auth.test/', auth);

    await client.authenticateWithRefreshToken('portal-refresh-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.test/refresh-token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify('portal-refresh-token'),
      }),
    );
    expect(auth).toMatchObject({
      username: 'tdei-user',
      subject: 'user-1',
      displayName: 'TDEI User',
      email: 'user@example.com',
      accessToken,
      refreshToken: 'rotated-refresh-token',
    });
    expect(client._requestHeaders.Authorization).toBe(`Bearer ${accessToken}`);
    expect(JSON.parse(localStorage.getItem('handoff-test-auth') ?? '{}'))
      .toMatchObject({ refreshToken: 'rotated-refresh-token' });

    client.clearAuth();
  });

  it('rejects an empty handoff token without making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const client = new TdeiClient(
      'https://auth.test/',
      new TdeiAuthStore('empty-handoff-test-auth'),
    );

    await expect(client.authenticateWithRefreshToken('  '))
      .rejects.toThrow('A TDEI refresh token is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
