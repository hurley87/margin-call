import * as Sentry from "@sentry/nextjs";
import {
  filterLocalhostEvent,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/runtime";

const nodeEnv = process.env.NODE_ENV;
const enabled = isSentryEnabled(nodeEnv);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled,
  environment: resolveSentryEnvironment(nodeEnv),
  tracesSampleRate: enabled ? 1 : 0,
  replaysSessionSampleRate: enabled ? 0.1 : 0,
  replaysOnErrorSampleRate: enabled ? 1.0 : 0,
  integrations: [Sentry.replayIntegration()],
  beforeSend: filterLocalhostEvent,
});
