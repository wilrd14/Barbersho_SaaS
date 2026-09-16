import * as Sentry from "@sentry/nextjs";

// Client-side Sentry init (S1-14). Solo NEXT_PUBLIC_* llegan al bundle del
// navegador; el DSN es publico por diseno en Sentry (no es un secreto).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});
