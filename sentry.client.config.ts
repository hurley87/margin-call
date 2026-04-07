import * as Sentry from "@sentry/nextjs";
import {
  resolveRuntimeEnvironment,
  shouldDropSentryEvent,
} from "./src/lib/sentry/event-filter";

const runtimeEnvironment = resolveRuntimeEnvironment({
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
});

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: runtimeEnvironment ?? undefined,
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  beforeSend(event) {
    return shouldDropSentryEvent(event, runtimeEnvironment) ? null : event;
  },
});
