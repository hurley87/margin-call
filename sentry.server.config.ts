import * as Sentry from "@sentry/nextjs";
import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropSentryEvent,
} from "@/lib/sentry/runtime";

const nodeEnv = process.env.NODE_ENV;
const isEnabled = isSentryEnabled({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  nodeEnv,
  vercelEnv: process.env.VERCEL_ENV,
});

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isEnabled,
  environment: resolveSentryEnvironment(nodeEnv, process.env.SENTRY_ENVIRONMENT),
  tracesSampleRate: isEnabled ? 1 : 0,
  beforeSend(event) {
    if (shouldDropSentryEvent(event)) {
      return null;
    }

    return event;
  },
});
