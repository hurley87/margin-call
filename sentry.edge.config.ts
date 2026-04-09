import * as Sentry from "@sentry/nextjs";
import {
  filterLocalhostEvent,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/runtime";

const nodeEnv = process.env.NODE_ENV;
const isEnabled = isSentryEnabled(nodeEnv);
const environment = resolveSentryEnvironment(nodeEnv);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isEnabled,
  environment,
  tracesSampleRate: isEnabled ? 1 : 0,
  beforeSend: filterLocalhostEvent,
});
