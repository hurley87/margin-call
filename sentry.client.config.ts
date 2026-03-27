import * as Sentry from "@sentry/nextjs";
import { getSentryEnvironment, shouldEnableSentry } from "@/lib/sentry/config";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: shouldEnableSentry(),
  environment: getSentryEnvironment(),
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
});
