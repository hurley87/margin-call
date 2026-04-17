import * as Sentry from "@sentry/nextjs";
import {
  beforeSendFilter,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/event-filter";

const sentryEnvironment = resolveSentryEnvironment();
const isSentryIngestionEnabled = isSentryEnabled(sentryEnvironment);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: sentryEnvironment,
  enabled: isSentryIngestionEnabled,
  tracesSampleRate: isSentryIngestionEnabled ? 1 : 0,
  replaysSessionSampleRate: isSentryIngestionEnabled ? 0.1 : 0,
  replaysOnErrorSampleRate: isSentryIngestionEnabled ? 1.0 : 0,
  integrations: isSentryIngestionEnabled ? [Sentry.replayIntegration()] : [],
  beforeSend: (event) => beforeSendFilter(event, sentryEnvironment),
});
