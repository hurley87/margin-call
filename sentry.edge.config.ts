import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled, shouldDropLocalhostEvent } from "@/lib/sentry/runtime";

const isEnabled = isSentryEnabled();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isEnabled,
  tracesSampleRate: isEnabled ? 1 : 0,
  beforeSend(event) {
    if (shouldDropLocalhostEvent(event)) {
      return null;
    }

    return event;
  },
});
