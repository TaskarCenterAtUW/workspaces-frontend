import { describe, expect, it } from 'vitest';
import {
  clearPendingAuthHandoff,
  getHandoffRefreshToken,
  getJwtIdentity,
  loadPendingAuthHandoff,
  storePendingAuthHandoff,
  stripHandoffRefreshToken,
} from '~/util/auth-handoff';

function jwt(payload: Record<string, unknown>) {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

  return `${encode({ alg: 'none' })}.${encode(payload)}.`;
}

describe('TDEI auth handoff URL helpers', () => {
  it('reads an encoded refresh token from the URL fragment', () => {
    expect(getHandoffRefreshToken('#refreshToken=refresh%2Btoken%2Fvalue')).toBe(
      'refresh+token/value',
    );
  });

  it('prefers the fragment but supports a legacy query token', () => {
    expect(getHandoffRefreshToken('#refreshToken=fragment-token', 'query-token'))
      .toBe('fragment-token');
    expect(getHandoffRefreshToken('', 'query-token')).toBe('query-token');
  });

  it('removes refresh tokens while preserving the dataset and other fragments', () => {
    const url = new URL(
      'https://workspaces.test/workspace/create/tdei'
      + '?tdeiRecordId=dataset-1&refreshToken=query-secret'
      + '#refreshToken=fragment-secret&section=details',
    );

    expect(stripHandoffRefreshToken(url)).toBe(
      '/workspace/create/tdei?tdeiRecordId=dataset-1#section=details',
    );
  });

  it('reads only the stable subject from a refresh-token JWT', () => {
    expect(getJwtIdentity(jwt({
      sub: 'user-b',
      name: 'User B',
      email: 'user-b@example.com',
    }))).toEqual({
      subject: 'user-b',
    });
  });

  it('rejects malformed JWTs and JWTs without a subject', () => {
    expect(getJwtIdentity('not-a-jwt')).toBeNull();
    expect(getJwtIdentity(jwt({ name: 'No Subject' }))).toBeNull();
  });

  it('reads a subject-only JWT without creating display text', () => {
    expect(getJwtIdentity(jwt({ sub: 'internal-user-id' }))).toEqual({
      subject: 'internal-user-id',
    });
  });

  it('stores and removes a pending account-switch decision in session storage', () => {
    const handoff = {
      destination: '/workspace/create/tdei?tdeiRecordId=dataset-1',
      identity: { subject: 'user-b' },
      refreshToken: 'refresh-token',
    };

    storePendingAuthHandoff(handoff);
    expect(loadPendingAuthHandoff()).toEqual(handoff);

    clearPendingAuthHandoff();
    expect(loadPendingAuthHandoff()).toBeNull();
  });
});
