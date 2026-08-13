import { tdeiClient } from '~/services/index'
import {
  AUTH_HANDOFF_ERROR_KEY,
  getHandoffRefreshToken,
  getJwtIdentity,
  storePendingAuthHandoff,
  stripHandoffRefreshToken,
} from '~/util/auth-handoff'

const ALLOW_ANONYMOUS = new Set([
  '/',
  '/help',
  '/signin'
]);

const TDEI_CREATE_PATH = '/workspace/create/tdei';

export default defineNuxtRouteMiddleware(async (to, _from) => {
  const { activate } = useAuthHandoff();

  if (to.path === TDEI_CREATE_PATH) {
    const refreshToken = getHandoffRefreshToken(
      window.location.hash,
      to.query.refreshToken,
    );

    if (refreshToken) {
      // Keep the token only in this local variable and remove it from browser
      // history before making any network request.
      const cleanDestination = stripHandoffRefreshToken(new URL(window.location.href));
      window.history.replaceState(window.history.state, '', cleanDestination);

      const incomingIdentity = getJwtIdentity(refreshToken);
      const hasExistingSession = tdeiClient.auth.ok;

      if (!incomingIdentity) {
        if (hasExistingSession) {
          sessionStorage.setItem(
            AUTH_HANDOFF_ERROR_KEY,
            `The TDEI Portal handoff was invalid. You are still signed in as ${tdeiClient.auth.displayName || 'your current Workspaces account'}.`,
          );
          return navigateTo('/auth/handoff', { replace: true });
        }

        sessionStorage.setItem(
          AUTH_HANDOFF_ERROR_KEY,
          'Your TDEI session could not be transferred. Please sign in again.',
        );
        window.rememberRoute = cleanDestination;
        return navigateTo('/signin', { replace: true });
      }

      if (
        hasExistingSession
        && tdeiClient.auth.subject !== incomingIdentity.subject
      ) {
        storePendingAuthHandoff({
          destination: cleanDestination,
          identity: incomingIdentity,
          refreshToken,
        });
        return navigateTo('/auth/handoff', { replace: true });
      }

      try {
        await activate(refreshToken);

        return navigateTo(cleanDestination, { replace: true });
      }
      catch {
        if (hasExistingSession) {
          sessionStorage.setItem(
            AUTH_HANDOFF_ERROR_KEY,
            `The TDEI account switch could not be completed. You are still signed in as ${tdeiClient.auth.displayName || 'your current Workspaces account'}.`,
          );
          return navigateTo('/auth/handoff', { replace: true });
        }

        tdeiClient.clearAuth();
        sessionStorage.setItem(
          AUTH_HANDOFF_ERROR_KEY,
          'Your TDEI session could not be transferred. Please sign in again.',
        );
        window.rememberRoute = cleanDestination;

        return navigateTo('/signin', { replace: true });
      }
    }
  }

  if (tdeiClient.auth.ok || ALLOW_ANONYMOUS.has(to.path)) {
    return;
  }

  window.rememberRoute = to;

  return navigateTo('/signin');
})
