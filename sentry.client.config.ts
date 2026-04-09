import * as Sentry from "@sentry/nextjs";
import {
  filterLocalhostEvent,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "./src/lib/sentry/runtime";

const isEnabled = isSentryEnabled(process.env.NODE_ENV);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isEnabled,
  environment: resolveSentryEnvironment({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV,
    explicitEnvironment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  }),
  tracesSampleRate: isEnabled ? 1 : 0,
  replaysSessionSampleRate: isEnabled ? 0.1 : 0,
  replaysOnErrorSampleRate: isEnabled ? 1.0 : 0,
  integrations: isEnabled ? [Sentry.replayIntegration()] : [],
  beforeSend(event) {
    return filterLocalhostEvent(event);
  },
});
