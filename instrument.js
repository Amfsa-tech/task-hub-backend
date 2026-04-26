import * as Sentry from '@sentry/node';
import { SENTRY_DSN } from './config/envConfig.js';

if (!SENTRY_DSN) {
  console.warn('⚠️  SENTRY_DSN not set — Sentry is disabled');
} else {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: false,
  });
}
