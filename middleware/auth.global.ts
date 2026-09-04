import { tdeiClient } from '~/services/index'
import { startTdeiSsoLogin } from '~/services/sso'

const ALLOW_ANONYMOUS = new Set([
  '/',
  '/help',
  '/signin',
  '/auth/callback',
  '/logout/callback'
]);

export default defineNuxtRouteMiddleware((to, _from) => {
  if (tdeiClient.auth.ok || ALLOW_ANONYMOUS.has(to.path)) {
    return;
  }

  window.rememberRoute = to;
  startTdeiSsoLogin(to.fullPath);

  return abortNavigation();
})
