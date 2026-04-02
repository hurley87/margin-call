import * as Sentry from "@sentry/nextjs";
import { getSentryEnvironment, shouldEnableSentry } from "./src/lib/sentry/config";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: shouldEnableSentry(),
  environment: getSentryEnvironment(),
  tracesSampleRate: 1,
});
