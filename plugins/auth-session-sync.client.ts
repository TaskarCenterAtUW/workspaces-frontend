import {
  authSessionState,
  cancelSessionReauthentication,
  completeSessionReauthentication,
  DEFAULT_SESSION_RETURN_ROUTE,
  getSessionReturnRoute,
  isAnonymousRoute,
  SESSION_EXIT_ROUTE,
  SESSION_RECOVERY_ROUTE
} from '~/services/auth-session';
import { tdeiAuth, tdeiClient } from '~/services';

export default defineNuxtPlugin(() => {
  const router = useRouter();

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage || event.key !== tdeiAuth._storageKey) {
      return;
    }

    tdeiClient.synchronizeAuthFromStorage();

    if (tdeiAuth.ok) {
      if (authSessionState.dialogOpen) {
        completeSessionReauthentication();
      }

      if (router.currentRoute.value.path === SESSION_RECOVERY_ROUTE) {
        void router.replace(
          getSessionReturnRoute(router.currentRoute.value.query.returnTo)
        );
        return;
      }

      if (router.currentRoute.value.path === SESSION_EXIT_ROUTE) {
        void router.replace(DEFAULT_SESSION_RETURN_ROUTE);
      }
      return;
    }

    if (event.newValue === null || !tdeiAuth.canReauthenticate) {
      if (authSessionState.dialogOpen) {
        cancelSessionReauthentication();
      }

      if (router.currentRoute.value.path !== SESSION_EXIT_ROUTE) {
        void router.replace(SESSION_EXIT_ROUTE);
      }
      return;
    }

    const currentRoute = router.currentRoute.value;
    if (
      currentRoute.path !== SESSION_RECOVERY_ROUTE
      && !isAnonymousRoute(currentRoute.path)
    ) {
      void router.replace({
        path: SESSION_RECOVERY_ROUTE,
        query: { returnTo: currentRoute.fullPath }
      });
    }
  };

  window.addEventListener('storage', onStorage);
  import.meta.hot?.dispose(() => {
    window.removeEventListener('storage', onStorage);
  });
});
