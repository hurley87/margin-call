import * as Sentry from "@sentry/nextjs";
import {
  beforeSendFilter,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/event-filter";

const nodeEnv = process.env.NODE_ENV;
const isEnabled = isSentryEnabled(nodeEnv);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: resolveSentryEnvironment(nodeEnv),
  enabled: isEnabled,
  tracesSampleRate: isEnabled ? 1 : 0,
  replaysSessionSampleRate: isEnabled ? 0.1 : 0,
  replaysOnErrorSampleRate: isEnabled ? 1.0 : 0,
  integrations: [Sentry.replayIntegration()],
  beforeSend: beforeSendFilter(nodeEnv),
});
