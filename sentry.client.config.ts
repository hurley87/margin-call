import * as Sentry from "@sentry/nextjs";
import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropSentryEvent,
} from "@/lib/sentry/runtime";

const nodeEnv = process.env.NODE_ENV;
const isEnabled = isSentryEnabled(nodeEnv);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isEnabled,
  environment: resolveSentryEnvironment(nodeEnv, process.env.SENTRY_ENVIRONMENT),
  tracesSampleRate: isEnabled ? 1 : 0,
  replaysSessionSampleRate: isEnabled ? 0.1 : 0,
  replaysOnErrorSampleRate: isEnabled ? 1.0 : 0,
  integrations: [Sentry.replayIntegration()],
  beforeSend(event) {
    if (shouldDropSentryEvent(event.request?.url)) {
      return null;
    }

    return event;
  },
});
