import * as Sentry from "@sentry/nextjs";

// Client only (AC-2): no instrumentation.ts / sentry.server.config.ts /
// sentry.edge.config.ts — this app's server runtime is OpenNext on
// Cloudflare Workers, a pairing @sentry/nextjs's server instrumentation
// isn't built for (see rationale in
// docs/specs/_root/0002-error-screens-sentry-update-channels/0002-sentry-observability.md).
// Error/crash capture only (AC-6): tracing and session replay are both off,
// sendDefaultPii is explicitly false, and an unset DSN disables reporting
// entirely rather than throwing.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // This SDK version replaced the single `sendDefaultPii` flag with
  // per-category data collection — `userInfo: false` is its equivalent of
  // AC-6's "no default PII": the SDK never auto-populates `user.*` from
  // instrumentation, only from the explicit `Sentry.setUser({ id })` call.
  dataCollection: { userInfo: false },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
