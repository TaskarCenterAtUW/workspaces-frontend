export const AUTH_HANDOFF_ERROR_KEY = 'tdei-auth-handoff-error';
export const PENDING_AUTH_HANDOFF_KEY = 'tdei-pending-auth-handoff';

type QueryToken = string | null | (string | null)[] | undefined;

export interface AuthHandoffIdentity {
  subject: string;
}

export interface PendingAuthHandoff {
  destination: string;
  identity: AuthHandoffIdentity;
  refreshToken: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');

  if (segments.length !== 3 || !segments[1]) {
    return null;
  }

  try {
    const base64 = segments[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(segments[1].length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));

    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  }
  catch {
    return null;
  }
}

export function getJwtIdentity(token: string): AuthHandoffIdentity | null {
  const payload = decodeJwtPayload(token);
  const subject = typeof payload?.sub === 'string' ? payload.sub.trim() : '';

  if (!subject) {
    return null;
  }

  return { subject };
}

export function getHandoffRefreshToken(hash: string, queryToken?: QueryToken) {
  const hashToken = new URLSearchParams(hash.replace(/^#/, '')).get('refreshToken');

  if (hashToken?.trim()) {
    return hashToken;
  }

  // Query-string support is retained for compatibility with early Portal
  // implementations. New links should use the fragment so the token is not
  // sent to the Workspaces web server.
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken;
  }

  return null;
}

export function stripHandoffRefreshToken(url: URL) {
  const cleanUrl = new URL(url);
  cleanUrl.searchParams.delete('refreshToken');

  const hash = new URLSearchParams(cleanUrl.hash.replace(/^#/, ''));
  hash.delete('refreshToken');
  cleanUrl.hash = hash.size > 0 ? hash.toString() : '';

  return `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`;
}

export function storePendingAuthHandoff(handoff: PendingAuthHandoff) {
  sessionStorage.setItem(PENDING_AUTH_HANDOFF_KEY, JSON.stringify(handoff));
}

export function loadPendingAuthHandoff(): PendingAuthHandoff | null {
  const serialized = sessionStorage.getItem(PENDING_AUTH_HANDOFF_KEY);

  if (!serialized) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(serialized);

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const identity = record.identity;

    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
      return null;
    }

    const identityRecord = identity as Record<string, unknown>;
    if (
      typeof record.destination !== 'string'
      || typeof record.refreshToken !== 'string'
      || typeof identityRecord.subject !== 'string'
    ) {
      return null;
    }

    return {
      destination: record.destination,
      refreshToken: record.refreshToken,
      identity: {
        subject: identityRecord.subject,
      },
    };
  }
  catch {
    return null;
  }
}

export function clearPendingAuthHandoff() {
  sessionStorage.removeItem(PENDING_AUTH_HANDOFF_KEY);
}
