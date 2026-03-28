import * as Sentry from "@sentry/nextjs";
import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropSentryEvent,
} from "./src/lib/sentry/runtime";

const nodeEnv = process.env.NODE_ENV;
const isEnabled = isSentryEnabled(nodeEnv);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isEnabled,
  environment: resolveSentryEnvironment(nodeEnv),
  tracesSampleRate: isEnabled ? 1 : 0,
  beforeSend(event) {
    if (shouldDropSentryEvent(event.request?.url)) {
      return null;
    }

    return event;
  },
});
