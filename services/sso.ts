const SSO_RETURN_TO_KEY = 'tdei-sso-return-to';

function tdeiApiEndpoint(path: string): URL {
  const configuredBaseUrl = import.meta.env.VITE_TDEI_API_URL;

  if (!configuredBaseUrl) {
    throw new Error('VITE_TDEI_API_URL is required');
  }

  const baseUrl = new URL(configuredBaseUrl, window.location.origin);
  if (!baseUrl.pathname.endsWith('/')) {
    baseUrl.pathname += '/';
  }

  return new URL(path, baseUrl);
}

function callbackUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function safeReturnTo(returnTo: string): string {
  try {
    const url = new URL(returnTo, window.location.origin);
    if (url.origin !== window.location.origin) return '/dashboard';
    return `${url.pathname}${url.search}${url.hash}`;
  }
  catch {
    return '/dashboard';
  }
}

export function getStoredSsoReturnTo(): string {
  return safeReturnTo(sessionStorage.getItem(SSO_RETURN_TO_KEY) || '/dashboard');
}

export function consumeSsoReturnTo(): string {
  const returnTo = getStoredSsoReturnTo();
  sessionStorage.removeItem(SSO_RETURN_TO_KEY);
  return returnTo;
}

export function prepareTdeiSsoLogin(returnTo: string = '/dashboard'): string {
  sessionStorage.setItem(SSO_RETURN_TO_KEY, safeReturnTo(returnTo));

  const redirectUrl = tdeiApiEndpoint('sso-redirect');
  redirectUrl.searchParams.set('redirect_uri', callbackUrl('/auth/callback'));

  const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID;
  if (clientId) {
    redirectUrl.searchParams.set('client_id', clientId);
  }

  return redirectUrl.toString();
}

export function startTdeiSsoLogin(returnTo: string = '/dashboard'): void {
  const redirectUrl = prepareTdeiSsoLogin(returnTo);
  window.location.assign(redirectUrl);
}

export function startTdeiSsoLogout(): void {
  const logoutUrl = tdeiApiEndpoint('sso-logout');
  logoutUrl.searchParams.set('redirect_uri', callbackUrl('/logout/callback'));

  const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID;
  if (clientId) {
    logoutUrl.searchParams.set('client_id', clientId);
  }

  window.location.assign(logoutUrl.toString());
}
