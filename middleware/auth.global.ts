import { tdeiClient } from '~/services/index';
import { BaseHttpClientError } from '~/services/http';
import {
  getSessionReturnRoute,
  isAnonymousRoute,
  SESSION_RECOVERY_ROUTE
} from '~/services/auth-session';
import { prepareTdeiSsoLogin } from '~/services/sso';

export default defineNuxtRouteMiddleware(async (to, _from) => {
  if (isAnonymousRoute(to.path)) {
    return;
  }

  if (to.path === SESSION_RECOVERY_ROUTE) {
    const returnTo = getSessionReturnRoute(to.query.returnTo);

    if (tdeiClient.auth.ok) {
      return navigateTo(returnTo, { replace: true });
    }

    if (tdeiClient.auth.canReauthenticate) {
      // Allow the recovery page to show the SSO session-expired dialog.
      return;
    }

    return navigateTo(prepareTdeiSsoLogin(returnTo), {
      external: true,
      replace: true
    });
  }

  if (tdeiClient.auth.needsRefresh) {
    // Refresh before page setup so its API calls start with a valid token.
    try {
      await tdeiClient.refreshToken();
      return;
    }
    catch (error: unknown) {
      if (!(error instanceof BaseHttpClientError) || error.response.status !== 401) {
        throw error;
      }

      tdeiClient.auth.expire();
    }
  }

  if (tdeiClient.auth.ok) {
    return;
  }

  if (tdeiClient.auth.canReauthenticate) {
    // Keep the requested URL so SSO recovery returns to the same page.
    return navigateTo({
      path: SESSION_RECOVERY_ROUTE,
      query: { returnTo: to.fullPath }
    }, { replace: true });
  }

  window.rememberRoute = to;
  return navigateTo(prepareTdeiSsoLogin(to.fullPath), {
    external: true,
    replace: true
  });
});
