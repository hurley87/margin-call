import * as Sentry from "@sentry/nextjs";
import {
  filterLocalhostEvents,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/runtime";

const nodeEnv = process.env.NODE_ENV;
const sentryEnabled = isSentryEnabled(nodeEnv);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: sentryEnabled,
  environment: resolveSentryEnvironment(nodeEnv),
  tracesSampleRate: sentryEnabled ? 1 : 0,
  replaysSessionSampleRate: sentryEnabled ? 0.1 : 0,
  replaysOnErrorSampleRate: sentryEnabled ? 1.0 : 0,
  integrations: [Sentry.replayIntegration()],
  beforeSend: filterLocalhostEvents,
});
