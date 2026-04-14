import * as Sentry from "@sentry/nextjs";
import {
  beforeSendFilter,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/event-filter";

const sentryEnvironment = resolveSentryEnvironment();
const sentryEnabled = isSentryEnabled(sentryEnvironment);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: sentryEnvironment,
  enabled: sentryEnabled,
  tracesSampleRate: sentryEnabled ? 1 : 0,
  replaysSessionSampleRate: sentryEnabled ? 0.1 : 0,
  replaysOnErrorSampleRate: sentryEnabled ? 1.0 : 0,
  integrations: sentryEnabled ? [Sentry.replayIntegration()] : [],
  beforeSend(event) {
    return beforeSendFilter(event, sentryEnvironment);
  },
});
