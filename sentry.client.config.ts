import * as Sentry from '@sentry/nuxt'

Sentry.init({
  dsn: 'https://59072b36b884fee8ff9a54c33b3c4557@o4510431738200064.ingest.us.sentry.io/4510546162614272',
  integrations: [
    Sentry.consoleLoggingIntegration({
      levels: ['log', 'warn', 'error'],
    }),
  ],
})