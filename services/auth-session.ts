import { reactive } from 'vue';

export const SESSION_EXIT_ROUTE = '/signin';
export const SESSION_RECOVERY_ROUTE = '/session-expired';
export const DEFAULT_SESSION_RETURN_ROUTE = '/dashboard';

const ANONYMOUS_ROUTES = new Set([
  '/',
  '/help',
  SESSION_EXIT_ROUTE,
  '/auth/callback',
  '/logout/callback'
]);

export function isAnonymousRoute(path: string): boolean {
  return ANONYMOUS_ROUTES.has(path);
}

export class SessionRecoveryCancelledError extends Error {
  constructor() {
    super('Session recovery was cancelled by the user.');
  }
}

export const authSessionState = reactive({
  dialogOpen: false,
  errorMessage: '',
  loading: false,
  username: ''
});

// Every blocked request waits on this promise, so one SSO recovery handles them all.
let recoveryPromise: Promise<void> | undefined;
let resolveRecovery: (() => void) | undefined;
let rejectRecovery: ((error: Error) => void) | undefined;

export function requestSessionReauthentication(username: string): Promise<void> {
  if (recoveryPromise) {
    // A recovery is already open; join it instead of opening another dialog.
    return recoveryPromise;
  }
  authSessionState.username = username;
  authSessionState.errorMessage = '';
  authSessionState.dialogOpen = true;

  recoveryPromise = new Promise((resolve, reject) => {
    resolveRecovery = resolve;
    rejectRecovery = reject;
  });
  return recoveryPromise;
}

export function openSessionReauthentication(username: string): void {
  // Route navigation can open the dialog before any protected request starts.
  // The dialog owns cancellation, so there is nothing for navigation to await.
  void requestSessionReauthentication(username).catch((error: unknown) => {
    if (!(error instanceof SessionRecoveryCancelledError)) {
      console.error('Unable to recover the expired session.', error);
    }
  });
}

export function getSessionReturnRoute(value: unknown): string {
  // Only return to routes inside this application.
  if (
    typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.startsWith('/\\')
    && value !== SESSION_RECOVERY_ROUTE
  ) {
    return value;
  }

  return DEFAULT_SESSION_RETURN_ROUTE;
}

export function completeSessionReauthentication(): void {
  // Release every request that was waiting for the new login.
  if (resolveRecovery) {
    resolveRecovery();
  }
  resetRecoveryState();
}

export function cancelSessionReauthentication(): void {
  // Tell waiting requests to stop when the user chooses Logout.
  if (rejectRecovery) {
    rejectRecovery(new SessionRecoveryCancelledError());
  }
  resetRecoveryState();
}

function resetRecoveryState(): void {
  authSessionState.dialogOpen = false;
  authSessionState.errorMessage = '';
  authSessionState.loading = false;
  recoveryPromise = undefined;
  resolveRecovery = undefined;
  rejectRecovery = undefined;
}
