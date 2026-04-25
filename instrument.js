import * as Sentry from '@sentry/node';
import { SENTRY_DSN } from './config/envConfig.js';

Sentry.init({
  dsn: SENTRY_DSN,
  sendDefaultPii: false,
});
