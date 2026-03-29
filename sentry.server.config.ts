import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled } from "@/lib/sentry/runtime";

const sentryEnabled = isSentryEnabled(process.env.NODE_ENV);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: sentryEnabled,
  tracesSampleRate: sentryEnabled ? 1 : 0,
});
