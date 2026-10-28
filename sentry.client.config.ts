import * as Sentry from '@sentry/nuxt';

// Only report errors from scripts served by the deployed sites (prod, stage, dev).
const DEPLOYED_SCRIPT_URLS = /^https:\/\/workspaces(-stage|-dev)?\.sidewalks\.washington\.edu\//;

// A request that never got a response (offline, blocked, a dev server's fake
// host). HTTP errors from our API clients carry a status and are still reported.
const NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed/;

Sentry.init({
  dsn: 'https://59072b36b884fee8ff9a54c33b3c4557@o4510431738200064.ingest.us.sentry.io/4510546162614272',
  environment: useRuntimeConfig().public.sentryEnvironment,
  enabled: !import.meta.dev,
  allowUrls: [DEPLOYED_SCRIPT_URLS],
  ignoreErrors: ['AbortError', /The operation was aborted/],
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (error instanceof TypeError && NETWORK_FAILURE.test(error.message)) {
      return null;
    }
    return event;
  },
  integrations: [
    Sentry.consoleLoggingIntegration({
      levels: ['log', 'warn', 'error']
    })
  ]
});
