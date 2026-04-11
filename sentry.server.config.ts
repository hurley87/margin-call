import * as Sentry from "@sentry/nextjs";
import {
  beforeSendFilter,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/event-filter";

const environment = resolveSentryEnvironment();
const isEnabled = isSentryEnabled(environment);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment,
  enabled: isEnabled,
  tracesSampleRate: isEnabled ? 1 : 0,
  beforeSend(event) {
    return beforeSendFilter(event, { environment });
  },
});
