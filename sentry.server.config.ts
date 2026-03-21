import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled, resolveSentryEnvironment } from "./src/lib/sentry/runtime";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isSentryEnabled(),
  environment: resolveSentryEnvironment(),
  tracesSampleRate: 1,
});
