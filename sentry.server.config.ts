import * as Sentry from "@sentry/nextjs";
import {
  filterLocalhostEvent,
  getSentryEnvironment,
  isSentryEnabled,
} from "./src/lib/sentry/runtime";

const isEnabled = isSentryEnabled();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isEnabled,
  environment: getSentryEnvironment(),
  tracesSampleRate: isEnabled ? 1 : 0,
  beforeSend: filterLocalhostEvent,
});
