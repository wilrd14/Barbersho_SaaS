import * as Sentry from "@sentry/nextjs";

// Server-side Sentry init (S1-14). DSN vacio en Sprint 1 (sin trafico real);
// Sentry.init con dsn undefined simplemente no envia nada, no rompe el build.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: Boolean(process.env.SENTRY_DSN),
});
