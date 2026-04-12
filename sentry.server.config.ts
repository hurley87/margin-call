import * as Sentry from "@sentry/nextjs";
import {
  beforeSendFilter,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "./src/lib/sentry/event-filter";

const environment = resolveSentryEnvironment({
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.VERCEL_ENV,
  sentryEnvironment: process.env.SENTRY_ENVIRONMENT,
});
const isEnabled = isSentryEnabled(environment);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment,
  enabled: isEnabled,
  tracesSampleRate: isEnabled ? 1 : 0,
  beforeSend: beforeSendFilter,
});
