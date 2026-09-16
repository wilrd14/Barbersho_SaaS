import * as Sentry from "@sentry/nextjs";

// Edge/Workers runtime Sentry init (S1-14).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: Boolean(process.env.SENTRY_DSN),
});
