import * as Sentry from "@sentry/nextjs";
import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropClientEvent,
} from "./src/lib/sentry/runtime";

const environment = resolveSentryEnvironment();
const enabled = isSentryEnabled();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled,
  environment,
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  beforeSend(event) {
    if (shouldDropClientEvent(event)) return null;
    return event;
  },
});
