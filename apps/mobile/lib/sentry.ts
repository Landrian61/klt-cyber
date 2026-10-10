import * as Sentry from '@sentry/react-native';

// Error/crash capture only (AC-6): tracing and session replay are both off,
// sendDefaultPii is explicitly false, and an unset DSN disables reporting
// entirely rather than throwing. See
// docs/specs/_root/0002-error-screens-sentry-update-channels/0002-sentry-observability.md.
export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  Sentry.init({
    dsn,
    enabled: !!dsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
    release: process.env.EXPO_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

export { Sentry };
