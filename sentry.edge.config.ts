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
  environment: resolveSentryEnvironment(nodeEnv),
  enabled: sentryEnabled,
  tracesSampleRate: sentryEnabled ? 1 : 0,
  beforeSend: filterLocalhostEvents,
});
