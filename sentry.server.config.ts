import dotenv from 'dotenv';
import * as Sentry from '@sentry/nuxt';

dotenv.config();

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
});