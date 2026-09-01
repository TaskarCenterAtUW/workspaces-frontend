import { tdeiClient } from '~/services/index'
import { BaseHttpClientError } from '~/services/http';
import {
  getSessionReturnRoute,
  isAnonymousRoute,
  SESSION_EXIT_ROUTE,
  SESSION_RECOVERY_ROUTE,
} from '~/services/auth-session';

export default defineNuxtRouteMiddleware(async (to, _from) => {
  if (isAnonymousRoute(to.path)) {
    return;
  }

  if (to.path === SESSION_RECOVERY_ROUTE) {
    // This route lets the dialog render before protected pages load.
    if (tdeiClient.auth.ok) {
      return navigateTo(
        getSessionReturnRoute(to.query.returnTo),
        { replace: true }
      );
    }

    if (tdeiClient.auth.canReauthenticate) {
      return;
    }

    return navigateTo(SESSION_EXIT_ROUTE, { replace: true });
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
    // Keep the requested URL so re-login can return the user to the same page.
    return navigateTo({
      path: SESSION_RECOVERY_ROUTE,
      query: { returnTo: to.fullPath }
    }, { replace: true });
  }

  window.rememberRoute = to;

  return navigateTo(SESSION_EXIT_ROUTE);
})
