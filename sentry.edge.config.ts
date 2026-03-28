import * as Sentry from "@sentry/nextjs";
import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropSentryEvent,
} from "./src/lib/sentry/runtime";

const nodeEnv = process.env.NODE_ENV;
const enabled = isSentryEnabled(nodeEnv);
const environment = resolveSentryEnvironment(nodeEnv, process.env.VERCEL_ENV);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled,
  environment,
  tracesSampleRate: enabled ? 1 : 0,
  beforeSend(event, hint) {
    const hintUrl = hint.originalException
      ? (hint.originalException as { url?: string }).url
      : undefined;
    const eventUrl = event.request?.url;

    if (shouldDropSentryEvent(eventUrl ?? hintUrl)) {
      return null;
    }

    return event;
  },
});
