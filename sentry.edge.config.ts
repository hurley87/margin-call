import * as Sentry from "@sentry/nextjs";
import {
  shouldDropLocalSentryEvent,
  shouldEnableSentryRuntime,
} from "./src/lib/sentry/runtime";

const isSentryEnabled = shouldEnableSentryRuntime({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.VERCEL_ENV,
});

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isSentryEnabled,
  tracesSampleRate: 1,
  beforeSend(event) {
    if (shouldDropLocalSentryEvent(event)) {
      return null;
    }

    return event;
  },
});
