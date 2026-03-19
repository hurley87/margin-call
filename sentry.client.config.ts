import * as Sentry from "@sentry/nextjs";
import {
  shouldDropLocalSentryEvent,
  shouldEnableSentryRuntime,
} from "./src/lib/sentry/runtime";

const isSentryEnabled = shouldEnableSentryRuntime({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
});

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isSentryEnabled,
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  beforeSend(event) {
    if (shouldDropLocalSentryEvent(event)) {
      return null;
    }

    return event;
  },
});
