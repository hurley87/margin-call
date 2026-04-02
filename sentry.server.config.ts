import * as Sentry from "@sentry/nextjs";
import {
  getSentryEnvironment,
  isLocalUrl,
  isSentryEnabled,
} from "@/lib/sentry/runtime";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryEnabled = isSentryEnabled({
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.VERCEL_ENV,
  sentryDsn,
});

Sentry.init({
  dsn: sentryDsn,
  enabled: sentryEnabled,
  environment: getSentryEnvironment({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  }),
  tracesSampleRate: 1,
  beforeSend(event) {
    if (isLocalUrl(event.request?.url)) {
      return null;
    }

    return event;
  },
});
